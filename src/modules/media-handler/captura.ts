import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { formatAmount } from "@/lib/format";

export type CapturaBankStyle = "spin" | "mercado_pago" | "okx" | "bbva" | "generic";

export interface CapturaParams {
  amount: number;
  currency: string;
  senderName: string;
  recipientLabel: string;
  clabe: string;
  bankStyle: CapturaBankStyle;
  bankName: string;
  date: string;
  time: string;
  reference: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spinTemplate(p: CapturaParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:360px;height:640px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff}
    .header{background:#6B2DFF;color:#fff;padding:20px 16px 16px}
    .logo{font-size:22px;font-weight:800;letter-spacing:-0.5px}
    .sub{font-size:12px;opacity:.85;margin-top:4px}
    .body{padding:20px 16px}
    .ok{color:#34C759;font-size:18px;font-weight:700;margin-bottom:8px}
    .amount{font-size:34px;font-weight:800;color:#111;margin:12px 0 20px}
    .row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
    .label{color:#8E8E93}.value{color:#111;font-weight:500;text-align:right;max-width:62%;word-break:break-all}
    .ref{margin-top:16px;font-size:11px;color:#AEAEB2;text-align:center}
  </style></head><body>
    <div class="header"><div class="logo">Spin</div><div class="sub">by OXXO · Comprobante</div></div>
    <div class="body">
      <div class="ok">✓ Pago enviado</div>
      <div class="amount">$${amount} MXN</div>
      <div class="row"><span class="label">De</span><span class="value">${escapeHtml(p.senderName)}</span></div>
      <div class="row"><span class="label">Para</span><span class="value">${escapeHtml(p.recipientLabel)}</span></div>
      <div class="row"><span class="label">CLABE</span><span class="value">${escapeHtml(p.clabe)}</span></div>
      <div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(p.date)}</span></div>
      <div class="row"><span class="label">Hora</span><span class="value">${escapeHtml(p.time)}</span></div>
      <div class="ref">Ref: ${escapeHtml(p.reference)}</div>
    </div>
  </body></html>`;
}

function mercadoPagoTemplate(p: CapturaParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:360px;height:640px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#009EE3;color:#fff}
    .header{padding:24px 16px 12px}
    .logo{font-size:20px;font-weight:700}
    .card{margin:12px;background:#fff;border-radius:14px;padding:20px 16px;color:#111}
    .ok{color:#00A650;font-size:17px;font-weight:700;margin-bottom:6px}
    .amount{font-size:32px;font-weight:800;margin:10px 0 18px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #f2f2f2;font-size:13px}
    .label{color:#999}.value{font-weight:500;text-align:right;max-width:60%;word-break:break-all}
  </style></head><body>
    <div class="header"><div class="logo">Mercado Pago</div></div>
    <div class="card">
      <div class="ok">¡Listo! Enviaste</div>
      <div class="amount">$${amount}</div>
      <div class="row"><span class="label">Destino</span><span class="value">${escapeHtml(p.recipientLabel)}</span></div>
      <div class="row"><span class="label">CLABE</span><span class="value">${escapeHtml(p.clabe)}</span></div>
      <div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(p.date)} ${escapeHtml(p.time)}</span></div>
      <div class="row"><span class="label">Operación</span><span class="value">${escapeHtml(p.reference)}</span></div>
    </div>
  </body></html>`;
}

function okxTemplate(p: CapturaParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:360px;height:640px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#000;color:#fff}
    .header{padding:22px 16px;border-bottom:1px solid #222}
    .logo{font-size:22px;font-weight:800;letter-spacing:2px}
    .body{padding:20px 16px}
    .ok{color:#00C087;font-size:16px;font-weight:600;margin-bottom:10px}
    .amount{font-size:30px;font-weight:700;margin-bottom:18px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #222;font-size:13px;color:#ccc}
    .value{color:#fff;text-align:right;max-width:58%;word-break:break-all}
  </style></head><body>
    <div class="header"><div class="logo">OKX</div></div>
    <div class="body">
      <div class="ok">Withdrawal Successful</div>
      <div class="amount">${amount} MXN</div>
      <div class="row"><span>From</span><span class="value">${escapeHtml(p.senderName)}</span></div>
      <div class="row"><span>To</span><span class="value">${escapeHtml(p.recipientLabel)}</span></div>
      <div class="row"><span>CLABE</span><span class="value">${escapeHtml(p.clabe)}</span></div>
      <div class="row"><span>Time</span><span class="value">${escapeHtml(p.date)} ${escapeHtml(p.time)}</span></div>
    </div>
  </body></html>`;
}

function genericTemplate(p: CapturaParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:360px;height:640px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f2f2f7;padding:20px 12px}
    .card{background:#fff;border-radius:16px;padding:20px 16px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
    .bank{font-size:12px;color:#8E8E93;text-transform:uppercase;margin-bottom:6px}
    .ok{color:#34C759;font-size:18px;font-weight:700;margin-bottom:10px}
    .amount{font-size:32px;font-weight:700;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid #f2f2f2;font-size:13px}
    .label{color:#8E8E93}.value{text-align:right;max-width:60%;word-break:break-all}
  </style></head><body><div class="card">
    <div class="bank">${escapeHtml(p.bankName)}</div>
    <div class="ok">Transferencia enviada ✓</div>
    <div class="amount">$${amount} MXN</div>
    <div class="row"><span class="label">De</span><span class="value">${escapeHtml(p.senderName)}</span></div>
    <div class="row"><span class="label">CLABE</span><span class="value">${escapeHtml(p.clabe)}</span></div>
    <div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(p.date)}</span></div>
    <div class="row"><span class="label">Hora</span><span class="value">${escapeHtml(p.time)}</span></div>
  </div></body></html>`;
}

export function buildCapturaHtml(params: CapturaParams): string {
  const amount = formatAmount(params.amount, params.currency);
  switch (params.bankStyle) {
    case "spin":
      return spinTemplate(params, amount);
    case "mercado_pago":
      return mercadoPagoTemplate(params, amount);
    case "okx":
      return okxTemplate(params, amount);
    default:
      return genericTemplate(params, amount);
  }
}

export async function renderCapturaPng(params: CapturaParams, outputPath: string): Promise<string> {
  const { chromium } = await import("playwright");
  const { getChromiumLaunchOptions } = await import("@/lib/playwright");
  const html = buildCapturaHtml(params);
  const htmlPath = outputPath.replace(/\.png$/, ".html");

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");

  const browser = await chromium.launch(getChromiumLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: outputPath, type: "png" });
  } finally {
    await browser.close();
  }

  return outputPath;
}

export function bankIdToCapturaStyle(bankId: string): CapturaBankStyle {
  if (bankId === "spin") return "spin";
  if (bankId === "mercado_pago") return "mercado_pago";
  if (bankId === "okx") return "okx";
  if (bankId === "bbva") return "bbva";
  return "generic";
}
