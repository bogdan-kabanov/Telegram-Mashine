import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getDb } from "@/lib/db";
import { configUploads } from "@/lib/db/schema";
import {
  amountsConfigSchema,
  banksConfigSchema,
  clientLegendSchema,
  geoConfigSchema,
} from "@/lib/schemas";

const VALIDATORS: Record<string, { parse: (data: unknown) => unknown; target: string }> = {
  legends: { parse: (d) => clientLegendSchema.array().parse(d), target: "data/scripts/legends.json" },
  manager_scripts: { parse: (d) => d, target: "data/scripts/manager.json" },
  banks: { parse: (d) => banksConfigSchema.parse(d), target: "config/banks.json" },
  geo: { parse: (d) => geoConfigSchema.parse(d), target: "config/geo.json" },
  amounts: { parse: (d) => amountsConfigSchema.parse(d), target: "config/amounts.json" },
};

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();

    const formData = await request.formData();
    const file = formData.get("file");
    const type = String(formData.get("type") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const validator = VALIDATORS[type];
    if (!validator) {
      return NextResponse.json({ error: "Invalid config type" }, { status: 400 });
    }

    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    validator.parse(parsed);

    const dataDir = process.env.DATA_DIR ?? "./data";
    const uploadDir = path.resolve(dataDir, "uploads", type);
    mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}_${file.name}`;
    const destPath = path.join(uploadDir, filename);
    writeFileSync(destPath, JSON.stringify(parsed, null, 2), "utf-8");

    const targetPath = path.resolve(validator.target);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(parsed, null, 2), "utf-8");

    const id = randomUUID();
    const db = getDb();
    await db.insert(configUploads).values({
      id,
      type,
      filename: file.name,
      path: destPath,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: `Конфиг ${type} загружен и применён`,
      path: validator.target,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
