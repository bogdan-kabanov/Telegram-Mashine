import { existsSync, readFileSync } from "fs";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function resolveRenderFile(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe !== filename.replace(/\\/g, "/").split("/").pop()) return null;
  if (!/\.(png|jpe?g|webp|gif)$/i.test(safe)) return null;

  const candidates = [
    path.resolve("public/renders", safe),
    path.resolve(process.env.DATA_DIR ?? "./data", "renders", safe),
    path.resolve("/app/public/renders", safe),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function mime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const filePath = resolveRenderFile(filename);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime(filePath),
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
    },
  });
}
