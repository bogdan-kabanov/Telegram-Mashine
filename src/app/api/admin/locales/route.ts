import { NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { listLocalesFromConfig } from "@/lib/i18n/locale-profile";

export async function GET() {
  try {
    await bootstrapApp();
    const config = await loadAppConfig();
    return NextResponse.json({
      ok: true,
      defaultLocale: config.geo.defaultLocale,
      locales: listLocalesFromConfig(config.geo),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
