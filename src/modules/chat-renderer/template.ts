import { formatChatTextHtml } from "@/lib/emoji/apple-server";
import { DialogClock } from "@/lib/dialog/timing";
import { computeMessageTimes } from "@/lib/format";
import { iostgicoFontFaceCss, iostgicoIconHtml } from "@/lib/fonts/iostgico";
import { sfProFontFaceCss } from "@/lib/fonts/sf-pro";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import type { ProjectConfig, ProjectTheme } from "@/lib/schemas/projects";
import type { RenderMessage } from "./render-types";

export type { RenderMessage } from "./render-types";

export interface RenderChatParams {
  project: ProjectConfig;
  clientName: string;
  clientAvatarUrl?: string | null;
  managerAvatarUrl?: string | null;
  wallpaperUrl?: string | null;
  /** Pre-blurred wallpaper for glass pills (Playwright-safe; no CSS filter). */
  frostWallpaperUrl?: string | null;
  /** Compact phone-sized wallpaper JPEG for ear ::after knockout (aligned via script). */
  wallpaperCutoutUrl?: string | null;
  /** Fallback solid when cutout image is missing. */
  wallpaperCutoutColor?: string | null;
  messages: RenderMessage[];
  statusText?: string;
  statusBarTime?: string;
  /** IANA zone for live / per-slide clock (bubbles + status bar). */
  clockTimeZone?: string;
  /** Constructor iframe: clickable media + postMessage to parent. */
  livePreview?: boolean;
}

const ICONS = {
  /* iostgico — Telegram iOS UI Kit icon font */
  paperclip: iostgicoIconHtml("paperclip", "tg-ico-attach"),
  stickerInput: iostgicoIconHtml("sticker", "tg-ico-sticker"),
  microphone: iostgicoIconHtml("microphone", "tg-ico-mic"),
  chevronBack: iostgicoIconHtml("chevronBack", "tg-ico-back"),
  /* Official Telegram logo plane (from brand SVG), cropped — not Lucide send */
  telegramPlane: `<svg width="14" height="14" viewBox="48 68 130 115" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#fff" d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043a8.13 8.13 0 0 1-4.925-1.542c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-1.38.79Z"/>
    <path fill="rgba(255,255,255,0.45)" d="M81.229 128.772 95.466 168.178s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6Z"/>
    <path fill="rgba(255,255,255,0.28)" d="M100.106 138.878 97.373 167.924s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"/>
  </svg>`,
  /* Photo HD/reload — Telegram iOS circular arrow on media */
  mediaReload: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20.2 12a8.2 8.2 0 1 1-2.35-5.8" stroke="#fff" stroke-width="2.15" stroke-linecap="round"/>
    <path d="M20.4 3.6v5.1h-5.1" stroke="#fff" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  /* Telegram iOS read receipts — short peek + full check (not WhatsApp double-V) */
  checks: `<svg width="16" height="10" viewBox="0 0 16 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1.2 5.55L3.65 8.0" stroke="#4FAE4E" stroke-width="1.45" stroke-linecap="round"/>
    <path d="M4.55 5.45L7.35 8.25L14.75 1.5" stroke="#4FAE4E" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  signal: `<svg width="19.5" height="12" viewBox="0 0 19.5 12" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="8.5" width="3.2" height="3.5" rx="0.7" fill="currentColor"/>
    <rect x="4.8" y="6" width="3.2" height="6" rx="0.7" fill="currentColor"/>
    <rect x="9.6" y="3.2" width="3.2" height="8.8" rx="0.7" fill="currentColor"/>
    <rect x="14.4" y="0.5" width="3.2" height="11.5" rx="0.7" fill="currentColor" fill-opacity="0.35"/>
  </svg>`,
  /* Real iOS/SF-style Wi‑Fi (Framework7 SF glyph — Apple status-bar geometry) */
  wifi: `<svg width="15.5" height="11" viewBox="2 9 52 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M 5.4648 25.0352 C 5.9102 25.4805 6.5664 25.4571 6.9882 25.0118 C 12.5195 19.1289 19.8320 16.0352 28.0117 16.0352 C 36.2382 16.0352 43.5742 19.1523 49.0819 25.0352 C 49.4803 25.4336 50.1135 25.4336 50.5354 24.9883 L 53.6525 21.8711 C 54.0274 21.4727 54.0274 20.9571 53.7226 20.5820 C 48.4258 14.0664 38.4648 9.2617 28.0117 9.2617 C 17.5586 9.2617 7.5976 14.0664 2.3007 20.5820 C 1.9726 20.9571 1.9961 21.4727 2.3711 21.8711 Z M 14.8398 34.4336 C 15.3086 34.9258 15.9180 34.8789 16.3633 34.3633 C 19.0820 31.3398 23.4882 29.1602 28.0117 29.2071 C 32.5820 29.1602 36.9648 31.4102 39.7070 34.4336 C 40.1523 34.9023 40.7382 34.9023 41.1836 34.4102 L 44.6758 30.9649 C 45.0507 30.5898 45.0976 30.0977 44.7461 29.6992 C 41.3476 25.5039 35.0429 22.4102 28.0117 22.4102 C 20.9804 22.4102 14.6758 25.5274 11.2773 29.6992 C 10.9258 30.0977 10.9726 30.5664 11.3476 30.9649 Z M 28.0117 46.7383 C 28.5039 46.7383 28.9492 46.4805 29.8164 45.6367 L 35.3007 40.3633 C 35.6523 40.0352 35.7226 39.5196 35.4180 39.1211 C 33.9414 37.2227 31.1758 35.5820 28.0117 35.5820 C 24.7773 35.5820 21.9648 37.2930 20.5117 39.2617 C 20.3007 39.5898 20.3711 40.0352 20.7226 40.3633 L 26.2070 45.6367 C 27.0742 46.4805 27.5195 46.7383 28.0117 46.7383 Z"/>
  </svg>`,
  battery: `<svg width="27" height="13" viewBox="0 0 27 13" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.6" y="0.6" width="23" height="11.8" rx="2.6" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.4"/>
    <rect x="2.1" y="2.15" width="18.5" height="8.7" rx="1.5" fill="currentColor"/>
    <path d="M25.1 4.1C25.95 4.45 26.5 5.25 26.5 6.5C26.5 7.75 25.95 8.55 25.1 8.9V4.1Z" fill="currentColor" fill-opacity="0.45"/>
  </svg>`,
  chevronDown: `<svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.2 1.4L7 7.2l5.8-5.8" stroke="#1C1C1E" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  avatarPlaceholder: `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="18" fill="#C4C4C6"/>
    <circle cx="18" cy="14" r="6" fill="#E5E5EA"/>
    <ellipse cx="18" cy="30" rx="10" ry="7" fill="#E5E5EA"/>
  </svg>`,
};

/** Fine film-grain tile for glass pills (not Gaussian blur). */
const TG_GRAIN_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="4" stitchTiles="stitch" seed="3"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>`,
)}`;

function seededUnit(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Seeded SVG tile of cyan/white sparkle dots (Telegram spoiler — no solid wash). */
function spoilerParticleTileUri(lightBubble: boolean): string {
  const rnd = seededUnit(lightBubble ? 0x2a7f : 0x4e19);
  const w = 72;
  const h = 18;
  const count = lightBubble ? 165 : 95;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.35 + rnd() * 0.75;
    let fill: string;
    if (lightBubble) {
      const t = rnd();
      if (t < 0.42) {
        fill = `rgba(55,210,255,${(0.72 + rnd() * 0.28).toFixed(3)})`;
      } else if (t < 0.72) {
        fill = `rgba(255,255,255,${(0.45 + rnd() * 0.4).toFixed(3)})`;
      } else {
        fill = `rgba(48,44,58,${(0.55 + rnd() * 0.3).toFixed(3)})`;
      }
    } else {
      const t = rnd();
      if (t < 0.4) {
        fill = `rgba(120,228,255,${(0.68 + rnd() * 0.32).toFixed(3)})`;
      } else {
        fill = `rgba(255,255,255,${(0.52 + rnd() * 0.43).toFixed(3)})`;
      }
    }
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TG_SPOILER_DARK_URI = spoilerParticleTileUri(false);
const TG_SPOILER_LIGHT_URI = spoilerParticleTileUri(true);

function bubbleIsLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 132;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

/**
 * Header pills: clipped pre-blurred wallpaper (Playwright-safe).
 * Input pills must NOT use this — wallpaper frost is opaque and hides chat bubbles.
 */
function glassFrostHtml(frostSrc: string | null, sharpSrc: string | null): string {
  const src = frostSrc ?? sharpSrc;
  const preblurred = Boolean(frostSrc);
  const frost = src
    ? `<span class="glass-frost" aria-hidden="true"><img class="glass-frost-img${preblurred ? " is-preblurred" : ""}" src="${src}" alt="" draggable="false" /></span>`
    : `<span class="glass-frost glass-frost--fallback" aria-hidden="true"></span>`;
  return `${frost}<span class="glass-tint" aria-hidden="true"></span><span class="glass-grain" aria-hidden="true"></span>`;
}

/** Input / scroll glass — tint only; real backdrop-filter blurs messages underneath. */
function glassLiveHtml(): string {
  return `<span class="glass-tint" aria-hidden="true"></span><span class="glass-grain" aria-hidden="true"></span>`;
}

/** Trimmed free-text helper (e.g. custom status override). Never auto-prefixes "@". */
export function chatHandleText(handle: string | undefined, fallback: string): string {
  const raw = (handle ?? "").trim();
  return raw || fallback;
}

function mediaReloadHtml(): string {
  return `<span class="media-reload" aria-hidden="true">${ICONS.mediaReload}</span>`;
}

function navAvatarBlock(
  url: string | null | undefined,
  frost: string,
  livePreview = false,
): string {
  const liveAttrs = livePreview
    ? ` data-live-slot="avatar" data-live-kind="avatar" data-live-id="header-avatar"`
    : "";
  const liveClass = livePreview ? " is-live-media" : "";
  if (url) {
    return `<div class="nav-avatar-wrap nav-glass${liveClass}"${liveAttrs}>${frost}<img class="nav-avatar" src="${url}" alt="" /></div>`;
  }
  return `<div class="nav-avatar-wrap nav-glass nav-avatar-placeholder${liveClass}"${liveAttrs}>${frost}${ICONS.avatarPlaceholder}</div>`;
}
function metaHtml(msg: RenderMessage, isOutgoing: boolean, variant: "inline" | "overlay"): string {
  const checks =
    isOutgoing && msg.read ? `<span class="checks" aria-hidden="true">${ICONS.checks}</span>` : "";
  return `<span class="meta meta-${variant}"><span class="time">${msg.time}</span>${checks}</span>`;
}

function bubbleStyle(color: string): string {
  return `background:${color};--bubble-bg:${color}`;
}

function voiceWaveformSvg(seed: string, isLight: boolean): string {
  const rnd = seededUnit(seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const bars: string[] = [];
  const count = 28;
  const fill = isLight ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.85)";
  for (let i = 0; i < count; i++) {
    const h = 4 + Math.floor(rnd() * 14);
    const x = 2 + i * 5;
    const y = 18 - h;
    bars.push(`<rect x="${x}" y="${y}" width="3" rx="1.5" height="${h}" fill="${fill}"/>`);
  }
  return `<svg class="voice-wave" width="142" height="22" viewBox="0 0 142 22" aria-hidden="true">${bars.join("")}</svg>`;
}

function renderVoiceBubble(
  msg: RenderMessage,
  theme: ProjectTheme,
  opts: { firstInGroup: boolean; lastInGroup: boolean },
): string {
  const isOutgoing = msg.role === "manager";
  const bubbleColor = isOutgoing ? theme.outgoingBubble : theme.incomingBubble;
  const groupClass = [
    "message",
    isOutgoing ? "outgoing" : "incoming",
    opts.firstInGroup ? "group-first" : "group-mid",
    opts.lastInGroup ? "group-last" : "group-continued",
  ].join(" ");
  const tailClass = opts.lastInGroup ? (isOutgoing ? "has-tail-out" : "has-tail-in") : "";
  const bubbleToneClass = bubbleIsLight(bubbleColor) ? "bubble-light" : "bubble-dark";
  const style = bubbleStyle(bubbleColor);
  const open = messageOpenTag(msg, groupClass);
  const duration = msg.voiceDuration ?? "0:12";
  const wave = voiceWaveformSvg(msg.id, bubbleIsLight(bubbleColor));
  const playFill = bubbleIsLight(bubbleColor) ? "#34C759" : "#fff";
  const playIcon = isOutgoing
    ? `<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5v13l11-6.5L2 1.5z" fill="${playFill}"/></svg>`
    : `<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5v13l11-6.5L2 1.5z" fill="#fff"/></svg>`;

  return `
    ${open}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"} ${bubbleToneClass} bubble-voice ${tailClass}" style="${style}">
          <div class="voice-row">
            <span class="voice-play" aria-hidden="true">${playIcon}</span>
            ${wave}
            <span class="voice-duration">${duration}</span>
          </div>
          ${metaHtml(msg, isOutgoing, "overlay")}
        </div>
      </div>
    </div>
  `;
}

function messageOpenTag(msg: RenderMessage, groupClass: string): string {
  const delay = Number.isFinite(msg.delayMinutes) ? Math.max(0, msg.delayMinutes ?? 0) : 0;
  const slot = msg.mediaSlot ? ` data-live-slot="${escapeHtml(msg.mediaSlot)}"` : "";
  const kind = msg.mediaKind ? ` data-live-kind="${escapeHtml(msg.mediaKind)}"` : "";
  const liveClass = msg.mediaSlot ? " is-live-media" : "";
  return `<div class="${groupClass}${liveClass}" data-delay="${delay}" data-live-id="${escapeHtml(msg.id)}"${slot}${kind}>`;
}

function renderBubble(
  msg: RenderMessage,
  theme: ProjectTheme,
  opts: { firstInGroup: boolean; lastInGroup: boolean },
): string {
  const isOutgoing = msg.role === "manager";
  const bubbleColor = isOutgoing
    ? msg.type === "image"
      ? theme.outgoingBubbleAlt ?? theme.outgoingBubble
      : theme.outgoingBubble
    : theme.incomingBubble;

  const groupClass = [
    "message",
    isOutgoing ? "outgoing" : "incoming",
    opts.firstInGroup ? "group-first" : "group-mid",
    opts.lastInGroup ? "group-last" : "group-continued",
  ].join(" ");

  // 1:1 Telegram: no side avatars next to bubbles (header avatar only).
  const tailClass = opts.lastInGroup ? (isOutgoing ? "has-tail-out" : "has-tail-in") : "";
  const bubbleToneClass = bubbleIsLight(bubbleColor) ? "bubble-light" : "bubble-dark";
  const style = bubbleStyle(bubbleColor);
  const open = messageOpenTag(msg, groupClass);

  if (msg.type === "voice") {
    return renderVoiceBubble(msg, theme, opts);
  }

  if (msg.type === "sticker" && msg.imageUrl) {
    return `
    ${open}
      <div class="bubble-wrap">
        <div class="sticker-wrap">
          <img class="sticker-image" src="${msg.imageUrl}" alt="" />
          ${metaHtml(msg, isOutgoing, "overlay")}
        </div>
      </div>
    </div>
  `;
  }

  if (msg.type === "image") {
    if (!msg.imageUrl) return "";
    const kindClass = msg.mediaKind ? ` bubble-image-${msg.mediaKind}` : "";
    const media = `<img class="bubble-image${kindClass}" src="${msg.imageUrl}" alt="" />`;
    return `
    ${open}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"} ${bubbleToneClass} bubble-media ${tailClass}" style="${style}">
          ${media}
          ${mediaReloadHtml()}
          ${metaHtml(msg, isOutgoing, "overlay")}
        </div>
      </div>
    </div>
  `;
  }

  // Text: time (+ ticks) float to the end of the last line — like Telegram iOS.
  return `
    ${open}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"} ${bubbleToneClass} ${tailClass}" style="${style}">
          <div class="text">${formatChatTextHtml(msg.content)}${metaHtml(msg, isOutgoing, "inline")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderMessageList(messages: RenderMessage[], theme: ProjectTheme): string {
  return messages
    .map((msg, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      return renderBubble(msg, theme, {
        firstInGroup: !prev || prev.role !== msg.role,
        lastInGroup: !next || next.role !== msg.role,
      });
    })
    .join("");
}

export function buildChatHtml(params: RenderChatParams): string {
  const ui = chatUiForLocale(params.project.locale);
  const {
    project,
    clientName,
    messages,
    /** Presence under the name — never manager @handle (that stays in captions / admin chrome). */
    statusText = ui.statusRecently,
    statusBarTime = "18:55",
  } = params;
  const clockTz = params.clockTimeZone ?? localeClockConfig(project.locale).timeZone;
  const livePreview = Boolean(params.livePreview);
  const theme = project.theme;
  const statusLight = theme.statusBarStyle === "light";
  const statusFg = statusLight ? "#fff" : "#000";
  /** Prefer <img src> over CSS url(data:) — Chromium drops huge data-URIs in stylesheets. */
  const wallpaperSrc = params.wallpaperUrl ?? null;
  const frostWallpaperSrc = params.frostWallpaperUrl ?? null;
  const wallpaperFallbackCss = "linear-gradient(180deg, #6ba3be 0%, #4a8fa8 100%)";
  const cutoutUrl = params.wallpaperCutoutUrl?.trim() || null;
  const cutoutFallback = params.wallpaperCutoutColor?.trim() || "#4a8fa8";
  const cutoutImageCss = cutoutUrl ? `url("${cutoutUrl}")` : "none";
  const messageHtml = renderMessageList(messages, theme);

  const wallpaperImg = wallpaperSrc
    ? `<img class="wallpaper-img" src="${wallpaperSrc}" alt="" draggable="false" />`
    : "";
  const frostLayerSrc = frostWallpaperSrc ?? wallpaperSrc;
  const frostImg = frostLayerSrc
    ? `<img class="frost-img${frostWallpaperSrc ? " is-preblurred" : ""}" src="${frostLayerSrc}" alt="" draggable="false" />`
    : "";
  const frost = glassFrostHtml(frostWallpaperSrc, wallpaperSrc);
  const liveGlass = glassLiveHtml();
  /** Header chrome: same translucent glass as input (backdrop), not dark charcoal frost. */
  const navChromeGlass = livePreview ? liveGlass : frost;

  return `<!DOCTYPE html>
<html lang="${ui.lang}">
<head>
  <meta charset="UTF-8" />
  <style>
    ${sfProFontFaceCss()}
    ${iostgicoFontFaceCss()}
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .tg-ico {
      font-family: "iostgico" !important;
      font-style: normal;
      font-weight: 400;
      line-height: 1;
      display: block;
      speak: never;
      -webkit-font-smoothing: antialiased;
      position: relative;
      z-index: 2;
      color: #1C1C1E;
    }
    .tg-ico-attach { font-size: 22px; color: #1C1C1E; }
    .tg-ico-sticker { font-size: 24px; color: #8E8E93; }
    .tg-ico-mic { font-size: 26px; color: #1C1C1E; }
    .tg-ico-back { font-size: 20px; color: #000; }
    body {
      width: 390px;
      height: 844px;
      font-family: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
      overflow: hidden;
      background: #000;
    }
    .phone {
      width: 390px;
      height: 844px;
      position: relative;
      overflow: hidden;
      --tg-grain: url("${TG_GRAIN_URI}");
      --tg-spoiler-dark: url("${TG_SPOILER_DARK_URI}");
      --tg-spoiler-light: url("${TG_SPOILER_LIGHT_URI}");
      --tail-cutout-fallback: ${cutoutFallback};
      --tail-cutout-image: ${cutoutImageCss};
    }
    /* Wallpaper + messages + frost live here so backdrop-filter can sample them */
    .phone-stage {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
    }
    .wallpaper {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: ${wallpaperSrc ? "#000" : wallpaperFallbackCss};
    }
    .wallpaper-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }

    /* Soft header frost — backdrop + faint wallpaper echo (Playwright-safe) */
    .header-frost {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 130px;
      z-index: 8;
      pointer-events: none;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.03);
      -webkit-backdrop-filter: blur(18px) saturate(145%);
      backdrop-filter: blur(18px) saturate(145%);
      -webkit-mask-image: linear-gradient(
        to bottom,
        #000 0%,
        #000 38%,
        rgba(0, 0, 0, 0.5) 68%,
        transparent 100%
      );
      mask-image: linear-gradient(
        to bottom,
        #000 0%,
        #000 38%,
        rgba(0, 0, 0, 0.5) 68%,
        transparent 100%
      );
    }
    .header-frost .frost-img {
      position: absolute;
      left: -12%;
      width: 124%;
      top: 0;
      height: 260%;
      object-fit: cover;
      object-position: center top;
      filter: blur(28px) saturate(150%);
      transform: scale(1.12);
      transform-origin: center top;
      opacity: 0.55;
      pointer-events: none;
    }
    .header-frost .frost-img.is-preblurred {
      filter: none;
      opacity: 0.7;
    }
    .header-frost::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.22;
      mix-blend-mode: overlay;
      background-image: var(--tg-grain);
      background-size: 120px 120px;
    }

    /* Bottom input frost — backdrop only so chat bubbles show through (no opaque wallpaper plate) */
    .input-frost {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 110px;
      z-index: 15;
      pointer-events: none;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.04);
      -webkit-backdrop-filter: blur(28px) saturate(160%);
      backdrop-filter: blur(28px) saturate(160%);
      -webkit-mask-image: linear-gradient(
        to top,
        #000 0%,
        #000 35%,
        rgba(0, 0, 0, 0.45) 65%,
        transparent 100%
      );
      mask-image: linear-gradient(
        to top,
        #000 0%,
        #000 35%,
        rgba(0, 0, 0, 0.45) 65%,
        transparent 100%
      );
    }
    .input-frost .frost-img {
      display: none;
    }

    .header-wrap {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      background: transparent;
      color: ${statusFg};
      pointer-events: none;
    }

    /* iOS Status Bar */
    .status-bar {
      height: 47px;
      padding: 14px 22px 0;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      position: relative;
    }
    .status-time {
      font-size: 15px;
      font-weight: 400;
      letter-spacing: -0.2px;
      color: ${statusFg};
      line-height: 20px;
      min-width: 54px;
      font-variation-settings: "wght" 400;
    }
    .status-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      /* Small air under top edge — like Dynamic Island inset */
      top: 6px;
    }
    .tg-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 20px;
      background: #007AFF;
      color: #fff;
      /* SF Pro Text Regular reads closer to iOS island label than Semibold */
      font-size: 11px;
      font-weight: 400;
      padding: 0 9px 0 6px;
      border-radius: 10px;
      letter-spacing: 0.04em;
      line-height: 1;
      white-space: nowrap;
      -webkit-font-smoothing: antialiased;
    }
    .tg-pill svg {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: block;
    }
    .status-icons {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 72px;
      justify-content: flex-end;
      padding-top: 1px;
    }
    .status-icons svg {
      color: ${statusFg};
    }

    /* Floating nav — three separate glass pills (Telegram iOS) */
    .nav-bar {
      min-height: 48px;
      height: auto;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 14px;
      margin: 0 12px 4px;
      padding: 0;
      position: relative;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    /* Header glass — same translucent material as input chips */
    .nav-glass {
      position: relative;
      overflow: hidden;
      isolation: isolate;
      background: rgba(255, 255, 255, 0.22);
      border: none;
      box-shadow:
        0 0.5px 0 rgba(255, 255, 255, 0.55) inset,
        0 1px 2px rgba(0, 0, 0, 0.06);
      -webkit-backdrop-filter: blur(30px) saturate(180%);
      backdrop-filter: blur(30px) saturate(180%);
      transform: translateZ(0);
      will-change: backdrop-filter;
    }
    /* Input / scroll glass — MUST use backdrop-filter so bubbles show through */
    .glass-circle,
    .input-pill,
    .scroll-down {
      position: relative;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.22);
      border: none;
      box-shadow:
        0 0.5px 0 rgba(255, 255, 255, 0.55) inset,
        0 1px 2px rgba(0, 0, 0, 0.06);
      -webkit-backdrop-filter: blur(30px) saturate(180%);
      backdrop-filter: blur(30px) saturate(180%);
      /* Force compositing layer for backdrop-filter in Chromium screenshots */
      transform: translateZ(0);
      will-change: backdrop-filter;
    }
    .glass-frost {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      border-radius: inherit;
      pointer-events: none;
    }
    .glass-frost-img {
      position: absolute;
      width: 390px;
      height: 844px;
      max-width: none;
      object-fit: cover;
      object-position: center;
      filter: blur(28px) saturate(130%) brightness(1.06);
      transform: scale(1.2);
      transform-origin: center center;
      pointer-events: none;
    }
    .glass-frost-img.is-preblurred {
      filter: none;
      transform: scale(1.04);
    }
    .glass-frost--fallback {
      inset: -30%;
      background: linear-gradient(180deg, #e8eef1 0%, #d5dee3 100%);
      filter: blur(22px) saturate(110%);
    }
    .glass-tint {
      position: absolute;
      inset: 0;
      z-index: 1;
      border-radius: inherit;
      pointer-events: none;
      background: rgba(255, 255, 255, 0.28);
    }
    .glass-grain {
      position: absolute;
      inset: 0;
      z-index: 2;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.32;
      mix-blend-mode: overlay;
      background-image: var(--tg-grain);
      background-size: 108px 108px;
    }
    /* Nav + input share the same light frost tint */
    .nav-glass > .glass-tint,
    .glass-circle > .glass-tint,
    .input-pill > .glass-tint,
    .scroll-down > .glass-tint {
      background: rgba(255, 255, 255, 0.18);
    }
    .nav-back {
      color: #000;
    }
    .nav-back > .glass-grain,
    .nav-center > .glass-grain {
      opacity: 0.32;
    }
    .nav-glass > :not(.glass-frost):not(.glass-tint):not(.glass-grain),
    .glass-circle > :not(.glass-frost):not(.glass-tint):not(.glass-grain),
    .input-pill > :not(.glass-frost):not(.glass-tint):not(.glass-grain),
    .scroll-down > :not(.glass-frost):not(.glass-tint):not(.glass-grain) {
      position: relative;
      z-index: 3;
    }
    .nav-back {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 10px 0 12px;
      border-radius: 20px;
      color: #000;
      font-size: 17px;
      font-weight: 400;
      letter-spacing: 0;
      line-height: 1;
      flex-shrink: 0;
      z-index: 1;
      justify-self: start;
    }
    .nav-back .tg-ico-back {
      flex-shrink: 0;
      display: block;
    }
    .nav-center {
      position: relative;
      left: auto;
      transform: none;
      text-align: center;
      /* Size to the longer of name/status. min-content stops the old
         max-width:100% collapse that showed only "@в" from "в сети". */
      width: max-content;
      min-width: min-content;
      max-width: min(220px, 100%);
      justify-self: center;
      min-height: 44px;
      height: auto;
      padding: 4px 16px 6px;
      border-radius: 23px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .nav-name {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0;
      color: #000;
      line-height: 21px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: max-content;
      min-width: min-content;
      max-width: 188px;
    }
    .nav-status {
      font-size: 13px;
      font-weight: 400;
      color: #787878;
      letter-spacing: 0;
      /* 15px line-box + overflow:hidden clipped descenders (y, g, @) */
      line-height: 18px;
      margin-top: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: max-content;
      min-width: min-content;
      max-width: 188px;
    }
    .nav-status::before,
    .nav-status::after {
      content: none;
    }
    .nav-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-left: 0;
      z-index: 1;
      display: block;
    }
    .nav-avatar-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: transparent;
      margin-left: 0;
      z-index: 1;
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }
    .nav-avatar-placeholder svg {
      width: 40px;
      height: 40px;
    }
    .nav-avatar-wrap {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      justify-self: end;
      position: relative;
      /* Thick glass ring like Telegram avatar chrome */
      border: 2.5px solid rgba(255, 255, 255, 0.88);
      box-sizing: border-box;
      box-shadow:
        0 0 0 0.5px rgba(255, 255, 255, 0.35) inset,
        0 1px 3px rgba(0, 0, 0, 0.1);
    }
    /* Chat Area — wallpaper is sibling .wallpaper; spacer pins thread to input */
    .chat-bg {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow-y: auto;
      padding: 100px 7px 80px;
      background: transparent;
      display: flex;
      flex-direction: column;
    }
    .chat-spacer {
      flex: 1 1 auto;
      min-height: 0;
      pointer-events: none;
    }
    .chat-messages {
      display: flex;
      flex-direction: column;
      width: 100%;
      flex: 0 0 auto;
    }

    /* Messages — Telegram layout: mergedSpacing ≈2, defaultSpacing ≈4 */
    .message {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      margin-bottom: 2px;
      width: 100%;
      position: relative;
      overflow: visible;
    }
    .message.group-last { margin-bottom: 6px; }
    .message.group-first.group-last { margin-bottom: 6px; }
    .message.incoming { padding-right: 48px; padding-left: 10px; }
    .message.outgoing {
      justify-content: flex-end;
      padding-left: 48px;
      padding-right: 10px;
    }
    .bubble-wrap {
      max-width: min(82%, 310px);
      width: fit-content;
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 0 1 auto;
      overflow: visible;
    }
    .message.incoming .bubble-wrap {
      align-self: flex-start;
      align-items: flex-start;
      max-width: min(82%, 310px);
    }
    .message.outgoing .bubble-wrap {
      align-self: flex-end;
      align-items: flex-end;
      max-width: min(82%, 310px);
    }
    .bubble {
      padding: 7px 12px 8px 12px;
      position: relative;
      display: inline-block;
      width: fit-content;
      max-width: 100%;
      height: auto;
      overflow: visible;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    }
    .bubble-in,
    .bubble-out {
      border-radius: 16px;
    }
    .incoming.group-mid .bubble-in { border-top-left-radius: 10px; }
    .incoming.group-continued .bubble-in { border-bottom-left-radius: 16px; }
    .outgoing.group-mid .bubble-out { border-top-right-radius: 10px; }
    .outgoing.group-continued .bubble-out { border-bottom-right-radius: 16px; }
    /*
     * Telegram/iOS ear (Samuel Kraft): ::before blob + ::after wallpaper knockout.
     * ::after samples a compact wallpaper tile aligned to .phone (see alignTailCutouts).
     */
    .bubble.has-tail-out,
    .bubble.has-tail-in {
      overflow: visible;
      position: relative;
      z-index: 1;
    }
    .bubble.has-tail-out::before,
    .bubble.has-tail-out::after,
    .bubble.has-tail-in::before,
    .bubble.has-tail-in::after {
      content: "";
      position: absolute;
      bottom: 0;
      height: 20px;
      pointer-events: none;
    }
    .bubble.has-tail-out::before {
      right: -7px;
      width: 20px;
      background: var(--bubble-bg);
      border-bottom-left-radius: 16px 14px;
    }
    .bubble.has-tail-out::after {
      right: -26px;
      width: 26px;
      background-color: var(--tail-cutout-fallback);
      background-image: var(--tail-cutout-image);
      background-size: 390px 844px;
      background-repeat: no-repeat;
      background-position: var(--cut-x, 0) var(--cut-y, 0);
      border-bottom-left-radius: 10px;
    }
    .bubble.has-tail-in::before {
      left: -7px;
      width: 20px;
      background: var(--bubble-bg);
      border-bottom-right-radius: 16px 14px;
    }
    .bubble.has-tail-in::after {
      left: -26px;
      width: 26px;
      background-color: var(--tail-cutout-fallback);
      background-image: var(--tail-cutout-image);
      background-size: 390px 844px;
      background-repeat: no-repeat;
      background-position: var(--cut-x, 0) var(--cut-y, 0);
      border-bottom-right-radius: 10px;
    }
    .text {
      font-size: 17px;
      font-weight: 400;
      line-height: 22px;
      letter-spacing: 0;
      color: #000;
      overflow-wrap: break-word;
      word-wrap: break-word;
      white-space: pre-wrap;
      position: relative;
      z-index: 1;
      display: flow-root;
      max-width: 100%;
    }
    img.apple-emoji {
      height: 1.2em;
      width: 1.2em;
      margin: 0 0.05em;
      vertical-align: -0.2em;
      display: inline-block;
      object-fit: contain;
    }
    /* Time (+ ticks) tuck into the last line like Telegram iOS (float, not a separate row). */
    .meta-inline {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      float: right;
      margin: 4px 0 0 8px;
      position: relative;
      top: 1px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
    }
    .meta-inline .time {
      font-size: 11px;
      font-weight: 400;
      color: rgba(82, 82, 82, 0.55);
      letter-spacing: 0.02em;
    }
    .outgoing .meta-inline .time {
      color: rgba(0, 140, 9, 0.8);
    }
    .meta-overlay {
      position: absolute;
      right: 7px;
      bottom: 6px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px 2px 7px;
      border-radius: 10px;
      background: rgba(16, 16, 18, 0.48);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      line-height: 1;
      z-index: 2;
    }
    .meta-overlay .time {
      font-size: 11px;
      font-weight: 400;
      color: rgba(255,255,255,0.95);
      letter-spacing: 0;
      text-shadow: 0 0.5px 1.5px rgba(0,0,0,0.55);
    }
    .checks {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }
    .checks svg { display: block; }
    .meta-overlay .checks path { stroke: #fff; }
    /* Telegram spoiler — cyan/white particle sparkle (no solid grey wash) */
    .tg-spoiler {
      position: relative;
      display: inline;
      border-radius: 5px;
      padding: 1px 3px 2px;
      color: transparent !important;
      -webkit-text-fill-color: transparent;
      background-color: transparent;
      background-image: var(--tg-spoiler-dark);
      background-size: 72px 18px;
      background-repeat: repeat;
      background-position: 0 0;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    .bubble-light .tg-spoiler {
      background-image: var(--tg-spoiler-light);
    }
    .image-placeholder {
      background: rgba(0,0,0,0.06);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      font-size: 14px;
      color: #666;
      min-width: 180px;
    }
    /* Telegram iOS photo: shrink-wrap to visible pixels (no letterbox beside tall receipts). */
    .bubble-image {
      display: block;
      width: auto;
      max-width: min(240px, 100%);
      height: auto;
      max-height: 360px;
      object-fit: contain;
      object-position: top center;
      border-radius: 14px;
      background: transparent;
    }
    .bubble-image-conditions {
      max-width: min(278px, 100%);
      max-height: 400px;
    }
    .bubble-image-bet,
    .bubble-image-receipt,
    .bubble-image-captura {
      max-width: min(250px, 100%);
      max-height: 340px;
    }
    .bubble-media {
      padding: 2px !important;
      background: transparent !important;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13) !important;
      overflow: hidden;
      width: fit-content;
      max-width: 100%;
      border-radius: 16px;
      line-height: 0;
      position: relative;
    }
    /* Media needs a real mask, not the solid-color Kraft pseudo tail. */
    .bubble-media.has-tail-in,
    .bubble-media.has-tail-out {
      overflow: visible;
      box-shadow: none !important;
    }
    .bubble-media.has-tail-in::before,
    .bubble-media.has-tail-in::after,
    .bubble-media.has-tail-out::before,
    .bubble-media.has-tail-out::after {
      content: none;
    }
    .bubble-media.has-tail-in {
      border-bottom-left-radius: 0;
      -webkit-mask-box-image: url("data:image/svg+xml;charset=utf-8,<svg height='35' viewBox='0 0 96 70' width='48' xmlns='http://www.w3.org/2000/svg'><path d='m96 35c1 7-5 37-42 35-37 2-43-28-42-35-1-7 5-37 42-35 37-2 43 28 42 35z'/><path d='m0 70c6-2 12-10 12-19v-16l14 27s-8 8-26 8z'/></svg>")
        50% 42% 46% 56%;
      -webkit-mask-box-image-repeat: stretch;
    }
    .bubble-media.has-tail-out {
      border-bottom-right-radius: 0;
      -webkit-mask-box-image: url("data:image/svg+xml;charset=utf-8,<svg height='35' viewBox='0 0 96 70' width='48' xmlns='http://www.w3.org/2000/svg'><path d='m84 35c1 7-5 37-42 35-37 2-43-28-42-35-1-7 5-37 42-35 37-2 43 28 42 35z'/><path d='m96 70c-6-2-12-10-12-19v-16l-14 27s8 8 26 8z'/></svg>")
        50% 56% 46% 42%;
      -webkit-mask-box-image-repeat: stretch;
    }
    .incoming.group-mid .bubble-media { border-top-left-radius: 10px; }
    .incoming.group-continued .bubble-media { border-bottom-left-radius: 16px; }
    .outgoing.group-mid .bubble-media { border-top-right-radius: 10px; }
    .outgoing.group-continued .bubble-media { border-bottom-right-radius: 16px; }
    .bubble-media .bubble-image {
      border-radius: inherit;
      margin: 0;
      display: block;
    }
    .bubble-media > .bubble-image,
    .bubble-media > .image-placeholder {
      border-radius: inherit;
    }
    .bubble-media.has-tail-in > .bubble-image,
    .bubble-media.has-tail-in > .image-placeholder {
      border-bottom-left-radius: 0;
    }
    .bubble-media.has-tail-out > .bubble-image,
    .bubble-media.has-tail-out > .image-placeholder {
      border-bottom-right-radius: 0;
    }
    .bubble-media .meta-overlay {
      bottom: 8px;
      right: 8px;
    }
    .media-reload {
      position: absolute;
      top: 7px;
      right: 7px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.46);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      pointer-events: none;
      box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.25);
    }
    .media-reload svg {
      display: block;
    }
    .sticker-wrap {
      position: relative;
      display: inline-block;
      max-width: 180px;
      background: transparent;
    }
    .sticker-image {
      display: block;
      width: 148px;
      height: auto;
      object-fit: contain;
      background: transparent;
      mix-blend-mode: normal;
    }
    .sticker-wrap .meta-overlay {
      background: rgba(0,0,0,0.32);
    }
    .bubble-voice {
      min-width: 200px;
      max-width: 260px;
      padding: 8px 10px 8px 8px;
    }
    .voice-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
    }
    .voice-play {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #34C759;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: inset 0 -1px 0 rgba(0,0,0,0.08);
    }
    .outgoing .voice-play {
      background: rgba(255,255,255,0.22);
    }
    .voice-wave {
      flex: 1;
      display: block;
      min-width: 0;
    }
    .voice-duration {
      font-size: 12px;
      font-weight: 500;
      opacity: 0.72;
      flex-shrink: 0;
      padding-right: 2px;
    }
    .bubble-voice .meta-overlay {
      bottom: 4px;
      right: 8px;
    }

    /* iOS Input Bar — Telegram-iOS: attach/input/mic all 40px */
    .input-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 14px 28px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 20;
    }
    .glass-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .glass-circle svg,
    .glass-circle .tg-ico {
      display: block;
      position: relative;
      z-index: 2;
    }
    .input-pill {
      flex: 1;
      height: 40px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 16px;
      min-width: 0;
    }
    .input-placeholder {
      flex: 1;
      position: relative;
      z-index: 2;
      font-size: 17px;
      font-weight: 400;
      /* Darker than #8E8E93 — readable on teal glass */
      color: rgba(0, 0, 0, 0.45);
      letter-spacing: 0;
      line-height: 22px;
      -webkit-font-smoothing: antialiased;
    }
    .input-sticker {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      position: relative;
      z-index: 2;
      width: 32px;
      height: 32px;
      margin-left: 2px;
      overflow: visible;
    }
    .input-sticker .tg-ico-sticker {
      display: block;
    }
    /* Scroll-to-bottom — light glass circle above composer */
    .scroll-down {
      position: absolute;
      right: 14px;
      bottom: 78px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 21;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      box-shadow:
        0 0.5px 0 rgba(255, 255, 255, 0.7) inset,
        0 1px 3px rgba(0, 0, 0, 0.12);
    }
    .scroll-down.is-visible {
      opacity: 1;
      visibility: visible;
    }
    .scroll-down svg {
      display: block;
      position: relative;
      z-index: 2;
    }
    .nav-back-badge {
      /* Telegram-iOS: 18×18, Font.regular(13) */
      min-width: 18px;
      width: 18px;
      height: 18px;
      padding: 0;
      border-radius: 50%;
      background: #000;
      color: #fff;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      flex-shrink: 0;
    }
    body.is-live .message[data-live-slot] {
      cursor: pointer;
    }
    body.is-live .message[data-live-slot] .bubble-media,
    body.is-live .message[data-live-slot] .sticker-wrap {
      position: relative;
    }
    body.is-live .message[data-live-slot]:hover .bubble-media,
    body.is-live .message[data-live-slot]:hover .sticker-wrap {
      box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.9);
    }
    body.is-live .message[data-live-slot] .bubble-media::after,
    body.is-live .message[data-live-slot] .sticker-wrap::after,
    body.is-live .nav-avatar-wrap.is-live-media::after {
      content: none;
    }
    body.is-live .nav-avatar-wrap.is-live-media {
      cursor: pointer;
      position: relative;
      pointer-events: auto;
    }
    body.is-live .chat-bg {
      overflow-y: auto;
      overflow-anchor: none;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 0, 0, 0.4) transparent;
    }
    body.is-live .chat-bg::-webkit-scrollbar {
      width: 5px;
    }
    body.is-live .chat-bg::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.35);
      border-radius: 4px;
    }
    body.is-live .chat-spacer {
      display: none;
    }
    body.is-live .input-bar {
      pointer-events: none;
    }
  </style>
</head>
<body class="${livePreview ? "is-live" : ""}">
  <div class="phone">
    <div class="phone-stage">
      <div class="wallpaper" aria-hidden="true">${wallpaperImg}</div>
      <div class="chat-bg">
        <div class="chat-spacer" aria-hidden="true"></div>
        <div class="chat-messages">
        ${messageHtml}
        </div>
      </div>
      <!-- Inside stage so backdrop-filter samples wallpaper + messages -->
      <div class="header-frost" aria-hidden="true">${frostImg}</div>
      <div class="input-frost" aria-hidden="true">${frostImg}</div>

      <div class="scroll-down${livePreview ? " is-visible" : ""}" aria-hidden="true">${liveGlass}${ICONS.chevronDown}</div>

      <div class="input-bar">
        <div class="glass-circle attach">
          ${liveGlass}
          ${ICONS.paperclip}
        </div>
        <div class="input-pill">
          ${liveGlass}
          <span class="input-placeholder">${escapeHtml(ui.inputPlaceholder)}</span>
          <div class="input-sticker">${ICONS.stickerInput}</div>
        </div>
        <div class="glass-circle mic">
          ${liveGlass}
          ${ICONS.microphone}
        </div>
      </div>
    </div>

    <div class="header-wrap">
      <div class="status-bar">
        <span class="status-time">${statusBarTime}</span>
        <div class="status-center">
          <span class="tg-pill">${ICONS.telegramPlane}<span>TELEGRAM</span></span>
        </div>
        <div class="status-icons">
          ${ICONS.signal}
          ${ICONS.wifi}
          ${ICONS.battery}
        </div>
      </div>

      <div class="nav-bar">
        <div class="nav-back nav-glass">
          ${navChromeGlass}
          ${ICONS.chevronBack}
          <span class="nav-back-badge">1</span>
        </div>
        <div class="nav-center nav-glass">
          ${navChromeGlass}
          <div class="nav-name">${escapeHtml(clientName)}</div>
          <div class="nav-status">${escapeHtml(statusText)}</div>
        </div>
        ${navAvatarBlock(params.clientAvatarUrl, frost, livePreview)}
      </div>
    </div>
  </div>
  <script>
    (function () {
      function syncGlassFrost() {
        var phone = document.querySelector(".phone");
        if (!(phone instanceof HTMLElement)) return;
        var pr = phone.getBoundingClientRect();
        document.querySelectorAll(".glass-frost-img").forEach(function (img) {
          if (!(img instanceof HTMLImageElement)) return;
          var host = img.closest(".nav-glass, .glass-circle, .input-pill, .scroll-down");
          if (!(host instanceof HTMLElement)) return;
          var r = host.getBoundingClientRect();
          img.style.left = (pr.left - r.left) + "px";
          img.style.top = (pr.top - r.top) + "px";
        });
      }
      window.syncGlassFrost = syncGlassFrost;
      function alignTailCutouts() {
        var phone = document.querySelector(".phone");
        if (!(phone instanceof HTMLElement)) return;
        var pr = phone.getBoundingClientRect();
        phone.querySelectorAll(".bubble.has-tail-in, .bubble.has-tail-out").forEach(function (el) {
          if (!(el instanceof HTMLElement)) return;
          var br = el.getBoundingClientRect();
          var aw = 26;
          var ah = 20;
          var isIn = el.classList.contains("has-tail-in");
          var ax = isIn ? br.left - aw : br.right;
          var ay = br.bottom - ah;
          el.style.setProperty("--cut-x", (pr.left - ax) + "px");
          el.style.setProperty("--cut-y", (pr.top - ay) + "px");
        });
      }
      window.alignTailCutouts = alignTailCutouts;
      window.addEventListener("resize", function () {
        syncGlassFrost();
        alignTailCutouts();
      });
      window.addEventListener("load", function () {
        syncGlassFrost();
        alignTailCutouts();
      });
      document.querySelectorAll(".glass-frost-img, .wallpaper-img, .frost-img").forEach(function (img) {
        img.addEventListener("load", function () {
          syncGlassFrost();
          alignTailCutouts();
        });
      });
      function boot() {
        syncGlassFrost();
        alignTailCutouts();
        requestAnimationFrame(function () {
          syncGlassFrost();
          alignTailCutouts();
          requestAnimationFrame(function () {
            syncGlassFrost();
            alignTailCutouts();
          });
        });
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
      } else {
        boot();
      }
    })();
  </script>
  <script>
    (function () {
      var timeZone = ${JSON.stringify(clockTz)};
      var live = ${livePreview ? "true" : "false"};
      function pad(n) { return String(n).padStart(2, "0"); }
      function hm(date) {
        try {
          var parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            hourCycle: "h23"
          }).formatToParts(date);
          var hour = "00";
          var minute = "00";
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === "hour") hour = parts[i].value;
            if (parts[i].type === "minute") minute = parts[i].value;
          }
          return pad(Number(hour) % 24) + ":" + pad(Number(minute));
        } catch (err) {
          return pad(date.getHours()) + ":" + pad(date.getMinutes());
        }
      }
      function applyChatClock(nowIso) {
        var now = new Date(nowIso);
        if (isNaN(now.getTime())) return;
        var nodes = Array.prototype.slice.call(document.querySelectorAll(".message"));
        var delays = nodes.map(function (el) {
          var d = Number(el.getAttribute("data-delay") || "0");
          return isFinite(d) ? d : 0;
        });
        var cursor = 0;
        var mono = delays.map(function (d, i) {
          var t = Math.max(0, d);
          cursor = i === 0 ? t : Math.max(cursor, t);
          return cursor;
        });
        var last = mono.length ? mono[mono.length - 1] : 0;
        nodes.forEach(function (el, i) {
          var when = new Date(now.getTime() - (last - mono[i]) * 60000);
          var timeEl = el.querySelector(".time");
          if (timeEl) timeEl.textContent = hm(when);
        });
        var st = document.querySelector(".status-time");
        if (st) st.textContent = hm(now);
      }
      window.applyChatClock = applyChatClock;
      function reportReady() {
        var chat = document.querySelector(".chat-bg");
        var maxScroll = 0;
        var clientHeight = 844;
        if (chat instanceof HTMLElement) {
          maxScroll = Math.max(0, chat.scrollHeight - chat.clientHeight);
          clientHeight = chat.clientHeight;
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "ctor-ready",
            maxScroll: maxScroll,
            clientHeight: clientHeight
          }, "*");
        }
      }
      window.addEventListener("message", function (ev) {
        var data = ev.data || {};
        if (data.type === "ctor-scroll") {
          var chat = document.querySelector(".chat-bg");
          if (chat instanceof HTMLElement) chat.scrollTop = data.top || 0;
          var scrollDown = document.querySelector(".scroll-down");
          if (scrollDown instanceof HTMLElement) {
            if (live) {
              scrollDown.classList.add("is-visible");
            } else {
              var nearBottom = (data.top || 0) >= (data.maxScroll || 0) - 12;
              scrollDown.classList.toggle("is-visible", (data.maxScroll || 0) > 24 && !nearBottom);
            }
          }
          if (data.nowIso) applyChatClock(data.nowIso);
          window.dispatchEvent(new Event("resize"));
          if (typeof window.syncGlassFrost === "function") window.syncGlassFrost();
          if (typeof window.alignTailCutouts === "function") window.alignTailCutouts();
        }
        if (data.type === "ctor-clock" && data.nowIso) applyChatClock(data.nowIso);
        if (data.type === "ctor-wheel") {
          var wheelChat = document.querySelector(".chat-bg");
          if (wheelChat instanceof HTMLElement) {
            wheelChat.scrollTop += Number(data.deltaY) || 0;
            if (typeof window.alignTailCutouts === "function") window.alignTailCutouts();
          }
        }
      });
      if (live) {
        document.addEventListener("click", function (e) {
          var t = e.target;
          var host = t && t.closest ? t.closest("[data-live-slot]") : null;
          if (!host) return;
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({
            type: "ctor-media",
            slot: host.getAttribute("data-live-slot"),
            kind: host.getAttribute("data-live-kind"),
            id: host.getAttribute("data-live-id")
          }, "*");
        });
        (function enableDragScroll() {
          var chat = document.querySelector(".chat-bg");
          if (!(chat instanceof HTMLElement)) return;
          var drag = null;
          var suppressClick = false;
          var pinStart = function (force) {
            if (!force && chat.getAttribute("data-user-scrolled") === "1") return;
            chat.scrollTop = 0;
          };
          chat.addEventListener("scroll", function () {
            if (chat.scrollTop > 12) chat.setAttribute("data-user-scrolled", "1");
          }, { passive: true });
          pinStart(true);
          requestAnimationFrame(function () { pinStart(false); });
          document.querySelectorAll("img").forEach(function (img) {
            img.addEventListener("load", function () { pinStart(false); });
          });
          chat.addEventListener("pointerdown", function (e) {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            drag = { id: e.pointerId, y: e.clientY, top: chat.scrollTop, moved: false };
          });
          chat.addEventListener("pointermove", function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var dy = e.clientY - drag.y;
            if (!drag.moved && Math.abs(dy) < 6) return;
            if (!drag.moved) {
              drag.moved = true;
              try { chat.setPointerCapture(e.pointerId); } catch (err) {}
            }
            chat.scrollTop = drag.top - dy;
            if (typeof window.alignTailCutouts === "function") window.alignTailCutouts();
          });
          function endDrag(e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.moved) suppressClick = true;
            drag = null;
          }
          chat.addEventListener("pointerup", endDrag);
          chat.addEventListener("pointercancel", endDrag);
          chat.addEventListener("click", function (e) {
            if (!suppressClick) return;
            e.preventDefault();
            e.stopPropagation();
            suppressClick = false;
          }, true);
          chat.addEventListener("scroll", function () {
            if (typeof window.alignTailCutouts === "function") window.alignTailCutouts();
          }, { passive: true });
        })();
      }
      function bootLive() {
        reportReady();
        requestAnimationFrame(reportReady);
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootLive);
      else bootLive();
    })();
  </script>
</body>
</html>`;
}

export function getSampleMessages(locale?: string, now = new Date()): RenderMessage[] {
  const samples = chatUiForLocale(locale).sampleMessages.map((m) => ({ ...m }));
  const clock = new DialogClock(() => 0.45);
  const withDelay = samples.map((m, index) => ({
    ...m,
    delayMinutes:
      index === 0
        ? clock.atStart(m.role as "client" | "manager")
        : clock.next(m.role as "client" | "manager"),
  }));
  const clockCfg = localeClockConfig(locale);
  const times = computeMessageTimes(withDelay, {
    now,
    timeZone: clockCfg.timeZone,
    locale: clockCfg.locale,
  });
  return withDelay.map((m, index) => ({
    ...m,
    time: times[index] ?? times.at(-1) ?? m.time,
  }));
}
