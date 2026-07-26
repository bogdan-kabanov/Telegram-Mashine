import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import {
  aiSettingsSchema,
  effectiveAiSettingsFromEnv,
  saveAiSettings,
} from "@/lib/config/ai-settings";
import { getEnv, resetEnvCache } from "@/lib/schemas/env";

export async function GET() {
  try {
    await bootstrapApp();
    const env = getEnv();
    return NextResponse.json({
      ok: true,
      settings: effectiveAiSettingsFromEnv(env),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as Record<string, unknown>;
    const { OPENAI_API_KEY: apiKeyPatch, ...rest } = body;

    const parsed = aiSettingsSchema.omit({ OPENAI_API_KEY: true }).partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if (Object.prototype.hasOwnProperty.call(body, "OPENAI_API_KEY")) {
      if (typeof apiKeyPatch !== "string") {
        return NextResponse.json({ error: "OPENAI_API_KEY must be a string" }, { status: 400 });
      }
      patch.OPENAI_API_KEY = apiKeyPatch;
    }

    saveAiSettings(patch);
    resetEnvCache();
    const env = getEnv();
    return NextResponse.json({
      ok: true,
      settings: effectiveAiSettingsFromEnv(env),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
