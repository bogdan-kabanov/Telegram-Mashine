import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import {
  effectiveProxySettings,
  proxyUrlSchema,
  saveProxySettings,
} from "@/lib/config/proxy-settings";
import { resetOutboundFetchCache } from "@/lib/http/outbound-fetch";
import { resetOpenAIClient } from "@/lib/openai/client";

export async function GET() {
  try {
    await bootstrapApp();
    return NextResponse.json({
      ok: true,
      settings: effectiveProxySettings(),
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

    if (!Object.prototype.hasOwnProperty.call(body, "PROXY_URL")) {
      return NextResponse.json({ error: "PROXY_URL is required" }, { status: 400 });
    }
    if (typeof body.PROXY_URL !== "string") {
      return NextResponse.json({ error: "PROXY_URL must be a string" }, { status: 400 });
    }

    const parsed = proxyUrlSchema.safeParse(body.PROXY_URL);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    saveProxySettings({ PROXY_URL: parsed.data });
    resetOutboundFetchCache();
    resetOpenAIClient();

    return NextResponse.json({
      ok: true,
      settings: effectiveProxySettings(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
