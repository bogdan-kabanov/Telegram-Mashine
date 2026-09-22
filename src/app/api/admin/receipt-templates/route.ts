import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { updateProject } from "@/lib/config/writer";
import { withBasePath } from "@/lib/base-path";
import {
  inferReceiptMedium,
  resolveReceiptTemplatesDir,
  type ReceiptRole,
} from "@/lib/openai/receipts";
import { getEnv } from "@/lib/schemas/env";

export const dynamic = "force-dynamic";

function templateRelPath(projectId: string, filename: string): string {
  return path.join("data/media/receipt_templates", projectId, filename).replace(/\\/g, "/");
}

function listTemplateFiles(projectId: string): string[] {
  const dir = resolveReceiptTemplatesDir(projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function GET(request: NextRequest) {
  try {
    await bootstrapApp();
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    const project = await getProjectById(projectId);
    const clientSet = new Set(project.receiptTemplates?.client ?? []);
    const managerSet = new Set(project.receiptTemplates?.manager ?? []);
    const files = listTemplateFiles(projectId).map((filename) => {
      const rel = templateRelPath(projectId, filename);
      return {
        filename,
        path: rel,
        url: withBasePath(`/api/admin/media/file?path=${encodeURIComponent(rel)}`),
        medium: inferReceiptMedium(filename),
        inClient: clientSet.has(filename),
        inManager: managerSet.has(filename),
      };
    });
    return NextResponse.json({
      ok: true,
      projectId,
      files,
      pools: {
        client: project.receiptTemplates?.client ?? [],
        manager: project.receiptTemplates?.manager ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "").trim();
    const roleRaw = String(form.get("role") ?? "client").trim();
    const role: ReceiptRole | "both" =
      roleRaw === "manager" || roleRaw === "both" ? roleRaw : "client";
    const file = form.get("file");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const project = await getProjectById(projectId);
    const dir = resolveReceiptTemplatesDir(projectId);
    mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.name || "").toLowerCase() || ".jpg";
    const safeExt = /\.(jpe?g|png|webp)$/i.test(ext) ? ext : ".jpg";
    const base =
      path
        .basename(file.name || "receipt", path.extname(file.name || ""))
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "receipt";
    const filename = `${base}_${randomUUID().slice(0, 8)}${safeExt}`;
    const abs = path.join(dir, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    writeFileSync(abs, buf);

    const rel = templateRelPath(projectId, filename);
    const client = [...(project.receiptTemplates?.client ?? [])];
    const manager = [...(project.receiptTemplates?.manager ?? [])];
    if ((role === "client" || role === "both") && !client.includes(filename)) {
      client.push(filename);
    }
    if ((role === "manager" || role === "both") && !manager.includes(filename)) {
      manager.push(filename);
    }

    // Schema requires min 1 each — keep at least one existing if lists were empty somehow
    const nextPools = {
      client: client.length ? client : [filename],
      manager: manager.length ? manager : client.length ? [...client] : [filename],
    };

    const updated = await updateProject(projectId, { receiptTemplates: nextPools });
    const dataDir = getEnv().DATA_DIR ?? "./data";

    return NextResponse.json({
      ok: true,
      file: {
        filename,
        path: rel,
        absPath: abs,
        url: withBasePath(`/api/admin/media/file?path=${encodeURIComponent(rel)}`),
        medium: inferReceiptMedium(filename),
        inClient: nextPools.client.includes(filename),
        inManager: nextPools.manager.includes(filename),
        dataDir,
      },
      pools: updated.receiptTemplates ?? nextPools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Toggle filename in client/manager pools without re-upload. */
export async function PATCH(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as {
      projectId?: string;
      filename?: string;
      role?: "client" | "manager";
      enabled?: boolean;
    };
    const projectId = body.projectId?.trim();
    const filename = body.filename?.trim();
    const role = body.role === "manager" ? "manager" : "client";
    if (!projectId || !filename) {
      return NextResponse.json({ error: "projectId and filename required" }, { status: 400 });
    }

    const project = await getProjectById(projectId);
    const abs = path.join(resolveReceiptTemplatesDir(projectId), filename);
    if (!existsSync(abs)) {
      return NextResponse.json({ error: "Файл шаблона не найден" }, { status: 404 });
    }

    const client = [...(project.receiptTemplates?.client ?? [])];
    const manager = [...(project.receiptTemplates?.manager ?? [])];
    const list = role === "client" ? client : manager;
    const enabled = body.enabled !== false;
    const idx = list.indexOf(filename);
    if (enabled && idx < 0) list.push(filename);
    if (!enabled && idx >= 0) {
      if (list.length <= 1) {
        return NextResponse.json(
          { error: "В пуле должен остаться хотя бы один шаблон" },
          { status: 400 },
        );
      }
      list.splice(idx, 1);
    }

    const nextPools = {
      client: role === "client" ? list : client,
      manager: role === "manager" ? list : manager,
    };
    const updated = await updateProject(projectId, { receiptTemplates: nextPools });
    return NextResponse.json({ ok: true, pools: updated.receiptTemplates ?? nextPools });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
