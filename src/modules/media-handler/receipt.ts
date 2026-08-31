import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { formatAmount } from "@/lib/format";

export type ReceiptBankStyle = "spin" | "mercado_pago" | "okx" | "bbva" | "generic";

export interface ReceiptParams {
  amount: number;
  currency: string;
  senderName: string;
  recipientName: string;
  bankName: string;
  bankStyle: ReceiptBankStyle;
  accountLastDigits: string;
  date: string;
  time: string;
  reference: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function spinReceipt(p: ReceiptParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}body{width:360px;height:640px;font-family:-apple-system,sans-serif;background:#f5f0ff}
    .card{margin:16px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(107,45,255,.15)}
    .top{background:#6B2DFF;color:#fff;padding:18px 16px}.logo{font-size:20px;font-weight:800}
    .body{padding:18px 16px}.ok{color:#34C759;font-size:18px;font-weight:700;margin-bottom:8px}
    .amount{font-size:34px;font-weight:800;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #f0f0f0;font-size:14px}
    .label{color:#8E8E93}.value{font-weight:500;text-align:right}
  </style></head><body><div class="card"><div class="top"><div class="logo">Spin</div></div><div class="body">
    <div class="ok">Transferencia exitosa ✓</div><div class="amount">${amount}</div>
    <div class="row"><span class="label">De</span><span class="value">${escapeHtml(p.senderName)}</span></div>
    <div class="row"><span class="label">Para</span><span class="value">${escapeHtml(p.recipientName)}</span></div>
    <div class="row"><span class="label">Cuenta</span><span class="value">****${escapeHtml(p.accountLastDigits)}</span></div>
    <div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(p.date)}</span></div>
    <div class="row"><span class="label">Hora</span><span class="value">${escapeHtml(p.time)}</span></div>
  </div></div></body></html>`;
}

function mercadoPagoReceipt(p: ReceiptParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}body{width:360px;height:640px;font-family:-apple-system,sans-serif;background:#009EE3}
    .card{margin:16px;background:#fff;border-radius:14px;padding:20px 16px}
    .logo{color:#009EE3;font-size:18px;font-weight:700;margin-bottom:12px}
    .ok{color:#00A650;font-size:17px;font-weight:700;margin-bottom:6px}
    .amount{font-size:32px;font-weight:800;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid #f2f2f2;font-size:13px}
    .label{color:#999}.value{text-align:right;font-weight:500}
  </style></head><body><div class="card"><div class="logo">Mercado Pago</div>
    <div class="ok">¡Transferiste!</div><div class="amount">${amount}</div>
    <div class="row"><span class="label">Para</span><span class="value">${escapeHtml(p.recipientName)}</span></div>
    <div class="row"><span class="label">De</span><span class="value">${escapeHtml(p.senderName)}</span></div>
    <div class="row"><span class="label">Cuenta</span><span class="value">****${escapeHtml(p.accountLastDigits)}</span></div>
    <div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(p.date)} ${escapeHtml(p.time)}</span></div>
  </div></body></html>`;
}

function okxReceipt(p: ReceiptParams, amount: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}body{width:360px;height:640px;font-family:-apple-system,sans-serif;background:#000;color:#fff;padding:16px}
    .logo{font-size:22px;font-weight:800;letter-spacing:2px;margin-bottom:16px}
    .ok{color:#00C087;font-size:16px;margin-bottom:8px}.amount{font-size:30px;font-weight:700;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #222;font-size:13px;color:#ccc}
    .value{color:#fff;text-align:right}
  </style></head><body><div class="logo">OKX</div><div class="ok">Transfer Completed</div><div class="amount">${amount}</div>
    <div class="row"><span>To</span><span class="value">${escapeHtml(p.recipientName)}</span></div>
    <div class="row"><span>From</span><span class="value">${escapeHtml(p.senderName)}</span></div>
    <div class="row"><span>Account</span><span class="value">****${escapeHtml(p.accountLastDigits)}</span></div>
    <div class="row"><span>Time</span><span class="value">${escapeHtml(p.date)} ${escapeHtml(p.time)}</span></div>
  </body></html>`;
}

function genericReceipt(p: ReceiptParams, amount: string): string {
  const ru = p.currency === "RUB";
  const ok = ru ? "Перевод выполнен ✓" : "Transferencia exitosa ✓";
  const from = ru ? "От" : "De";
  const to = ru ? "Кому" : "Para";
  const account = ru ? "Счёт" : "Cuenta";
  const date = ru ? "Дата" : "Fecha";
  const time = ru ? "Время" : "Hora";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}body{width:360px;height:640px;font-family:-apple-system,sans-serif;background:#f2f2f7;padding:24px 16px}
    .card{background:#fff;border-radius:16px;padding:24px 20px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .bank{font-size:13px;color:#8e8e93;text-transform:uppercase;margin-bottom:8px}
    .ok{font-size:22px;font-weight:700;color:#34c759;margin-bottom:20px}
    .amount{font-size:36px;font-weight:700;margin-bottom:24px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #f2f2f7;font-size:14px}
    .label{color:#8e8e93}.value{font-weight:500;text-align:right}
  </style></head><body><div class="card"><div class="bank">${escapeHtml(p.bankName)}</div>
    <div class="ok">${ok}</div><div class="amount">${amount}</div>
    <div class="row"><span class="label">${from}</span><span class="value">${escapeHtml(p.senderName)}</span></div>
    <div class="row"><span class="label">${to}</span><span class="value">${escapeHtml(p.recipientName)}</span></div>
    <div class="row"><span class="label">${account}</span><span class="value">****${escapeHtml(p.accountLastDigits)}</span></div>
    <div class="row"><span class="label">${date}</span><span class="value">${escapeHtml(p.date)}</span></div>
    <div class="row"><span class="label">${time}</span><span class="value">${escapeHtml(p.time)}</span></div>
  </div></body></html>`;
}

export function buildReceiptHtml(params: ReceiptParams): string {
  const amount =
    params.currency === "MXN"
      ? `$${formatAmount(params.amount, params.currency)} MXN`
      : formatAmount(params.amount, params.currency);
  switch (params.bankStyle) {
    case "spin":
      return spinReceipt(params, amount);
    case "mercado_pago":
      return mercadoPagoReceipt(params, amount);
    case "okx":
      return okxReceipt(params, amount);
    default:
      return genericReceipt(params, amount);
  }
}

export function bankIdToReceiptStyle(bankId: string): ReceiptBankStyle {
  if (bankId === "spin") return "spin";
  if (bankId === "mercado_pago") return "mercado_pago";
  if (bankId === "okx") return "okx";
  return "generic";
}

export async function renderReceiptPng(params: ReceiptParams, outputPath: string): Promise<string> {
  const { configureScreenshotPage, launchChromium, screenshotOptions, waitForPageRenderReady } =
    await import("@/lib/playwright");
  const html = buildReceiptHtml(params);
  const htmlPath = outputPath.replace(/\.png$/, ".html");

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");

  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    configureScreenshotPage(page);
    await page.setContent(html, { waitUntil: "load" });
    await waitForPageRenderReady(page);
    await page.waitForTimeout(200);
    await page.screenshot(screenshotOptions({ path: outputPath, type: "png" }));
  } finally {
    await browser.close();
  }

  return outputPath;
}
