import { formatChatTextHtml } from "@/lib/emoji/apple-server";
import { sfProFontFaceCss } from "@/lib/fonts/sf-pro";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
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
  messages: RenderMessage[];
  statusText?: string;
  statusBarTime?: string;
  /** Telegram Stories ring around the peer avatar (when client photo / story exists). */
  hasStories?: boolean;
}

const ICONS = {
  /* Telegram attach — classic diagonal paperclip */
  paperclip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#1C1C1E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  /* Telegram iOS sticker — circle with folded corner (iPhone) */
  stickerInput: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.4 16.28A8.55 8.55 0 1 1 12 3.45" stroke="#636366" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M12 3.45C15.5 4.5 18.5 9 19.4 16.28" stroke="#636366" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M12 3.45C10.5 8 14 14 19.4 16.28" stroke="#636366" stroke-width="1.55" stroke-linecap="round"/>
  </svg>`,
  microphone: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2.8c-1.7 0-3.05 1.35-3.05 3.05v6.3c0 1.7 1.35 3.05 3.05 3.05s3.05-1.35 3.05-3.05v-6.3C15.05 4.15 13.7 2.8 12 2.8z" stroke="#1C1C1E" stroke-width="1.45"/>
    <path d="M5.9 11.4c0 3.2 2.5 5.85 5.6 6.2v2.4h1v-2.4c3.1-.35 5.6-3 5.6-6.2" stroke="#1C1C1E" stroke-width="1.45" stroke-linecap="round"/>
  </svg>`,
  /* Official Telegram logo plane (from brand SVG), cropped — not Lucide send */
  telegramPlane: `<svg width="14" height="14" viewBox="48 68 130 115" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#fff" d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043a8.13 8.13 0 0 1-4.925-1.542c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-1.38.79Z"/>
    <path fill="rgba(255,255,255,0.45)" d="M81.229 128.772 95.466 168.178s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6Z"/>
    <path fill="rgba(255,255,255,0.28)" d="M100.106 138.878 97.373 167.924s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"/>
  </svg>`,
  /* iOS SF-style chevron — thinner stroke like real Telegram */
  chevronBack: `<svg width="10" height="18" viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.2 1.6L1.7 10l7.5 8.4" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

function avatarBlock(url: string | null | undefined, fallback: string): string {
  if (url) {
    return `<img class="avatar" src="${url}" alt="" />`;
  }
  return `<div class="avatar avatar-fallback">${fallback.charAt(0).toUpperCase()}</div>`;
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
  return `${frost}<span class="glass-tint" aria-hidden="true"></span>`;
}

/** Input / scroll glass — tint only; real backdrop-filter blurs messages underneath. */
function glassLiveHtml(): string {
  return `<span class="glass-tint" aria-hidden="true"></span>`;
}

function navAvatarBlock(
  url: string | null | undefined,
  frost: string,
  hasStories: boolean,
): string {
  const storyClass = hasStories ? " has-story" : "";
  const ring = hasStories ? `<span class="story-ring" aria-hidden="true"></span>` : "";
  if (url) {
    return `<div class="nav-avatar-wrap nav-glass${storyClass}">${ring}${frost}<img class="nav-avatar" src="${url}" alt="" /></div>`;
  }
  return `<div class="nav-avatar-wrap nav-glass nav-avatar-placeholder${storyClass}">${ring}${frost}${ICONS.avatarPlaceholder}</div>`;
}
function metaHtml(msg: RenderMessage, isOutgoing: boolean, variant: "inline" | "overlay"): string {
  const checks =
    isOutgoing && msg.read ? `<span class="checks" aria-hidden="true">${ICONS.checks}</span>` : "";
  return `<span class="meta meta-${variant}"><span class="time">${msg.time}</span>${checks}</span>`;
}

function bubbleTailHtml(isOutgoing: boolean, lastInGroup: boolean, bubbleColor: string): string {
  if (!lastInGroup) return "";
  /* Official Telegram Desktop bubble_tail@3x mask (6×10 dp) — tip at bottom */
  const side = isOutgoing ? "tail-out" : "tail-in";
  return `<span class="bubble-tail ${side}" style="background:${bubbleColor}" aria-hidden="true"></span>`;
}

function renderBubble(
  msg: RenderMessage,
  theme: ProjectTheme,
  clientAvatarUrl: string | null | undefined,
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

  // Telegram: avatar only on the last bubble of an incoming group; spacer keeps column straight.
  const avatarSlot = !isOutgoing
    ? opts.lastInGroup
      ? avatarBlock(clientAvatarUrl, "C")
      : `<div class="avatar avatar-spacer" aria-hidden="true"></div>`
    : "";

  const tail = bubbleTailHtml(isOutgoing, opts.lastInGroup, bubbleColor);

  if (msg.type === "sticker" && msg.imageUrl) {
    return `
    <div class="${groupClass}">
      ${avatarSlot}
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
    const kindClass = msg.mediaKind ? ` bubble-image-${msg.mediaKind}` : "";
    const media =
      msg.imageUrl != null
        ? `<img class="bubble-image${kindClass}" src="${msg.imageUrl}" alt="" />`
        : `<div class="image-placeholder">📷 ${escapeHtml(msg.content)}</div>`;
    return `
    <div class="${groupClass}">
      ${avatarSlot}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"} bubble-media" style="background:${bubbleColor};--bubble-bg:${bubbleColor}">
          ${media}
          ${metaHtml(msg, isOutgoing, "overlay")}
          ${tail}
        </div>
      </div>
    </div>
  `;
  }

  // Text: time (+ ticks) float to the end of the last line — like Telegram, not absolute pad.
  return `
    <div class="${groupClass}">
      ${avatarSlot}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"}" style="background:${bubbleColor};--bubble-bg:${bubbleColor}">
          <div class="text">${formatChatTextHtml(msg.content)}${metaHtml(msg, isOutgoing, "inline")}</div>
          ${tail}
        </div>
      </div>
    </div>
  `;
}

function renderMessageList(
  messages: RenderMessage[],
  theme: ProjectTheme,
  clientAvatarUrl?: string | null,
): string {
  return messages
    .map((msg, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      return renderBubble(msg, theme, clientAvatarUrl, {
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
    statusText = ui.statusRecently,
    statusBarTime = "18:55",
  } = params;
  const theme = project.theme;
  const statusLight = theme.statusBarStyle === "light";
  const statusFg = statusLight ? "#fff" : "#000";
  /** Prefer <img src> over CSS url(data:) — Chromium drops huge data-URIs in stylesheets. */
  const wallpaperSrc = params.wallpaperUrl ?? null;
  const frostWallpaperSrc = params.frostWallpaperUrl ?? null;
  const wallpaperFallbackCss = "linear-gradient(180deg, #6ba3be 0%, #4a8fa8 100%)";

  const messageHtml = renderMessageList(messages, theme, params.clientAvatarUrl);

  const wallpaperImg = wallpaperSrc
    ? `<img class="wallpaper-img" src="${wallpaperSrc}" alt="" draggable="false" />`
    : "";
  const frostLayerSrc = frostWallpaperSrc ?? wallpaperSrc;
  const frostImg = frostLayerSrc
    ? `<img class="frost-img${frostWallpaperSrc ? " is-preblurred" : ""}" src="${frostLayerSrc}" alt="" draggable="false" />`
    : "";
  const frost = glassFrostHtml(frostWallpaperSrc, wallpaperSrc);
  const liveGlass = glassLiveHtml();

  return `<!DOCTYPE html>
<html lang="${ui.lang}">
<head>
  <meta charset="UTF-8" />
  <style>
    ${sfProFontFaceCss()}
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
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
      content: none;
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
      height: 44px;
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
    /* Header glass — clipped pre-blurred wallpaper (Playwright-safe) */
    .nav-glass {
      position: relative;
      overflow: hidden;
      isolation: isolate;
      background: transparent;
      border: none;
      box-shadow:
        0 0.5px 0 rgba(255, 255, 255, 0.55) inset,
        0 1px 2px rgba(0, 0, 0, 0.06);
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
    /* Input tint lighter so green bubble reads through */
    .glass-circle > .glass-tint,
    .input-pill > .glass-tint,
    .scroll-down > .glass-tint {
      background: rgba(255, 255, 255, 0.18);
    }
    .nav-glass > :not(.glass-frost):not(.glass-tint),
    .glass-circle > :not(.glass-frost):not(.glass-tint),
    .input-pill > :not(.glass-frost):not(.glass-tint),
    .scroll-down > :not(.glass-frost):not(.glass-tint) {
      position: relative;
      z-index: 2;
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
    .nav-back svg {
      flex-shrink: 0;
      width: 10px;
      height: 18px;
      display: block;
      overflow: visible;
    }
    .nav-center {
      position: relative;
      left: auto;
      transform: none;
      text-align: center;
      /* Hug content — do not stretch across the row */
      width: max-content;
      max-width: 100%;
      justify-self: center;
      height: 40px;
      padding: 3px 16px 4px;
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      pointer-events: none;
      overflow: hidden;
    }
    .nav-name {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0;
      color: #000;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .nav-status {
      font-size: 13px;
      font-weight: 400;
      color: #787878;
      letter-spacing: 0;
      line-height: 15px;
      margin-top: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
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
    .nav-avatar-wrap.has-story {
      width: 44px;
      height: 44px;
      overflow: visible;
      border: none;
      box-shadow: none;
      background: transparent;
      padding: 0;
    }
    .nav-avatar-wrap.has-story .story-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(
        from 210deg,
        #f9ce34 0deg,
        #ee2a7b 120deg,
        #6228d7 240deg,
        #f9ce34 360deg
      );
      z-index: 0;
      pointer-events: none;
    }
    .nav-avatar-wrap.has-story .nav-avatar {
      width: 36px;
      height: 36px;
      border: 2px solid rgba(255, 255, 255, 0.95);
      box-sizing: border-box;
      position: relative;
      z-index: 2;
    }
    .nav-avatar-wrap.has-story.nav-avatar-placeholder {
      width: 44px;
      height: 44px;
    }
    .nav-avatar-wrap.has-story.nav-avatar-placeholder svg {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.95);
      box-sizing: border-box;
      position: relative;
      z-index: 2;
    }
    .nav-avatar-wrap.has-story .glass-frost,
    .nav-avatar-wrap.has-story .glass-tint {
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      width: auto;
      height: auto;
      z-index: 1;
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
    }
    .message.group-last { margin-bottom: 4px; }
    .message.group-first.group-last { margin-bottom: 4px; }
    .message.incoming { padding-right: 52px; }
    .message.outgoing {
      justify-content: flex-end;
      padding-left: 52px;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-bottom: 1px;
    }
    .avatar-spacer {
      visibility: hidden;
      pointer-events: none;
    }
    .avatar-fallback {
      background: #C7C7CC;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }
    .bubble-wrap {
      max-width: calc(100% - 34px);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .message.outgoing .bubble-wrap {
      align-items: flex-end;
      max-width: 100%;
    }
    .message.incoming .bubble-wrap { max-width: calc(100% - 34px); }
    .bubble {
      padding: 6px 12px;
      position: relative;
      display: inline-block;
      max-width: 100%;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
      vertical-align: top;
    }
    .bubble-in,
    .bubble-out {
      border-radius: 16px;
    }
    /* Telegram corners: main 16, merge 10; tailed corner is square (tail draws the ear) */
    .incoming.group-mid .bubble-in { border-top-left-radius: 10px; }
    .incoming.group-continued .bubble-in { border-bottom-left-radius: 16px; }
    .incoming.group-last .bubble-in { border-bottom-left-radius: 0; }
    .outgoing.group-mid .bubble-out { border-top-right-radius: 10px; }
    .outgoing.group-continued .bubble-out { border-bottom-right-radius: 16px; }
    .outgoing.group-last .bubble-out { border-bottom-right-radius: 0; }
    /* Official tdesktop bubble_tail — CSS mask, tip at bottom; 1px overlap kills the seam */
    .bubble-tail {
      position: absolute;
      bottom: 0;
      width: 6px;
      height: 10px;
      pointer-events: none;
      z-index: 0;
      line-height: 0;
      overflow: visible;
      -webkit-mask-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAeCAYAAAAhDE4sAAAA1klEQVR42u2UPQrCQBCF3/MCEiwFS/UA4lm8gkfwImJpaguxswliJZaCTUobqyDphDTPKhCWhOxf6VSzO/DtN8PuUpIQHktGAJUkk0EEmysAxABlsUAXAAid0ZvkOIbRqU5CQcc6CWmtJJnEMDo0FyGgfXPh21pOch7DKDU3fIy+ACYki1Cj1IT4GFUApiRfZsHVaNcGcTUqAMxIftqKLkbrLggAQHax7T3GApJZ+fZAnpKGoaC7pJH1BDsgZ+dragAqSRuv19eA3CQtvD8VSQ9JK/yjK34RPgHp8p8P/gAAAABJRU5ErkJggg==");
      mask-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAeCAYAAAAhDE4sAAAA1klEQVR42u2UPQrCQBCF3/MCEiwFS/UA4lm8gkfwImJpaguxswliJZaCTUobqyDphDTPKhCWhOxf6VSzO/DtN8PuUpIQHktGAJUkk0EEmysAxABlsUAXAAid0ZvkOIbRqU5CQcc6CWmtJJnEMDo0FyGgfXPh21pOch7DKDU3fIy+ACYki1Cj1IT4GFUApiRfZsHVaNcGcTUqAMxIftqKLkbrLggAQHax7T3GApJZ+fZAnpKGoaC7pJH1BDsgZ+dragAqSRuv19eA3CQtvD8VSQ9JK/yjK34RPgHp8p8P/gAAAABJRU5ErkJggg==");
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
    }
    .bubble-tail.tail-out {
      right: -5px;
      transform: scaleX(-1);
    }
    .bubble-tail.tail-in {
      left: -5px;
    }
    .text {
      font-size: 17px;
      font-weight: 400;
      line-height: 22px;
      letter-spacing: 0;
      color: #000;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    img.apple-emoji {
      height: 1.2em;
      width: 1.2em;
      margin: 0 0.05em;
      vertical-align: -0.2em;
      display: inline-block;
      object-fit: contain;
    }
    /* Time (+ ticks) sit on the last line — no fake padding-right strip */
    .meta-inline {
      float: right;
      display: inline-flex;
      align-items: flex-end;
      gap: 3px;
      margin: 5px 0 -1px 10px;
      position: relative;
      top: 3px;
      line-height: 1;
      white-space: nowrap;
    }
    .meta-inline .time {
      font-size: 11px;
      font-weight: 400;
      color: rgba(82, 82, 82, 0.6);
      letter-spacing: 0;
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
      padding: 1px 4px 1px 5px;
      border-radius: 8px;
      /* Soft shadow instead of opaque plate */
      background: rgba(0, 0, 0, 0.18);
      line-height: 1;
      z-index: 1;
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
    /* Telegram spoiler — animated secret blot over card / CLABE digits */
    .tg-spoiler {
      position: relative;
      display: inline;
      border-radius: 4px;
      padding: 1px 3px;
      color: transparent !important;
      -webkit-text-fill-color: transparent;
      background-color: rgba(118, 118, 128, 0.92);
      background-image:
        radial-gradient(circle at 15% 30%, rgba(255,255,255,0.45) 0 0.9px, transparent 1.2px),
        radial-gradient(circle at 55% 70%, rgba(255,255,255,0.35) 0 0.8px, transparent 1.1px),
        radial-gradient(circle at 80% 25%, rgba(0,0,0,0.35) 0 0.9px, transparent 1.2px),
        radial-gradient(circle at 35% 85%, rgba(255,255,255,0.3) 0 0.7px, transparent 1px),
        linear-gradient(
          105deg,
          rgba(90, 90, 100, 0.95) 0%,
          rgba(160, 160, 170, 0.85) 40%,
          rgba(100, 100, 110, 0.95) 70%,
          rgba(140, 140, 150, 0.9) 100%
        );
      background-size: 12px 12px, 10px 10px, 14px 14px, 11px 11px, 240% 100%;
      background-blend-mode: soft-light, soft-light, multiply, soft-light, normal;
      animation: tg-spoiler-shimmer 2.2s linear infinite;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    @keyframes tg-spoiler-shimmer {
      0% { background-position: 0 0, 0 0, 0 0, 0 0, 100% 0; }
      100% { background-position: 12px 8px, -8px 6px, 10px -6px, -6px 10px, -100% 0; }
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
    /* Telegram iOS photo message: portrait-friendly, no floating white pad */
    .bubble-image {
      display: block;
      width: 240px;
      max-width: min(240px, 100%);
      height: auto;
      max-height: 360px;
      object-fit: contain;
      object-position: top center;
      border-radius: 14px;
      background: transparent;
    }
    .bubble-image-conditions {
      width: 278px;
      max-width: min(278px, 100%);
      max-height: 400px;
    }
    .bubble-image-bet,
    .bubble-image-receipt,
    .bubble-image-captura {
      width: 250px;
      max-width: min(250px, 100%);
      max-height: 340px;
    }
    .bubble-media {
      padding: 2px !important;
      background: transparent !important;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13) !important;
      overflow: visible;
      border-radius: 16px;
      line-height: 0;
      position: relative;
    }
    .incoming.group-mid .bubble-media { border-top-left-radius: 10px; }
    .incoming.group-continued .bubble-media { border-bottom-left-radius: 16px; }
    .incoming.group-last .bubble-media { border-bottom-left-radius: 0; }
    .outgoing.group-mid .bubble-media { border-top-right-radius: 10px; }
    .outgoing.group-continued .bubble-media { border-bottom-right-radius: 16px; }
    .outgoing.group-last .bubble-media { border-bottom-right-radius: 0; }
    .bubble-media .bubble-image {
      border-radius: inherit;
      margin: 0;
      display: block;
    }
    /* Clip media to bubble radius while letting the tail stick out */
    .bubble-media > .bubble-image,
    .bubble-media > .image-placeholder {
      border-radius: inherit;
    }
    .bubble-media .meta-overlay {
      bottom: 8px;
      right: 8px;
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
    .glass-circle svg {
      display: block;
      position: relative;
      z-index: 2;
      shape-rendering: geometricPrecision;
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
    .input-sticker svg {
      display: block;
      width: 24px;
      height: 24px;
      overflow: visible;
      shape-rendering: geometricPrecision;
    }
    /* Scroll-to-bottom — shown when chat is scrolled up */
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
  </style>
</head>
<body>
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

      <div class="scroll-down" aria-hidden="true">${liveGlass}${ICONS.chevronDown}</div>

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
          ${frost}
          ${ICONS.chevronBack}
          <span class="nav-back-badge">1</span>
        </div>
        <div class="nav-center nav-glass">
          ${frost}
          <div class="nav-name">${escapeHtml(clientName)}</div>
          <div class="nav-status">${escapeHtml(statusText)}</div>
        </div>
        ${navAvatarBlock(params.clientAvatarUrl, frost, params.hasStories === true)}
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
      window.addEventListener("resize", syncGlassFrost);
      window.addEventListener("load", syncGlassFrost);
      document.querySelectorAll(".glass-frost-img, .wallpaper-img, .frost-img").forEach(function (img) {
        img.addEventListener("load", syncGlassFrost);
      });
      function boot() {
        syncGlassFrost();
        requestAnimationFrame(function () {
          syncGlassFrost();
          requestAnimationFrame(syncGlassFrost);
        });
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
      } else {
        boot();
      }
    })();
  </script>
</body>
</html>`;
}

export function getSampleMessages(locale?: string): RenderMessage[] {
  return chatUiForLocale(locale).sampleMessages.map((m) => ({ ...m }));
}
