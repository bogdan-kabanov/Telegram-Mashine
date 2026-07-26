import { formatChatTextHtml } from "@/lib/emoji/apple-server";
import { sfProFontFaceCss } from "@/lib/fonts/sf-pro";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import type { ProjectConfig, ProjectTheme } from "@/lib/schemas/projects";

export interface RenderMessage {
  id: string;
  role: "client" | "manager";
  type: "text" | "image" | "sticker";
  content: string;
  time: string;
  read?: boolean;
  imageUrl?: string;
  /** Distinguishes conditions / bets / receipts for sizing. */
  mediaKind?: "conditions" | "bet" | "receipt" | "captura" | "story";
}

export interface RenderChatParams {
  project: ProjectConfig;
  clientName: string;
  clientAvatarUrl?: string | null;
  managerAvatarUrl?: string | null;
  wallpaperUrl?: string | null;
  messages: RenderMessage[];
  statusText?: string;
  statusBarTime?: string;
}

const ICONS = {
  /* Telegram iOS attach — vertical paperclip (not Lucide diagonal) */
  paperclip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.2 9.35v7.05c0 2.65-2.15 4.8-4.8 4.8s-4.8-2.15-4.8-4.8V7.55c0-1.75 1.4-3.15 3.15-3.15s3.15 1.4 3.15 3.15v8a1.5 1.5 0 01-3 0V9.2" stroke="#000" stroke-width="2.15" stroke-linecap="round"/>
  </svg>`,
  stickerInput: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8.4" stroke="#636366" stroke-width="1.85"/>
    <path d="M15.35 5.85C11.85 5.85 9.85 9.05 9.85 12.15C9.85 15.25 11.85 18.45 15.35 18.45" stroke="#636366" stroke-width="1.85" stroke-linecap="round"/>
    <circle cx="9.7" cy="10.15" r="1.15" fill="#636366"/>
    <path d="M11.55 14.55C12.25 15.3 13.25 15.75 14.4 15.75" stroke="#636366" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`,
  microphone: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2.8c-1.7 0-3.05 1.35-3.05 3.05v6.3c0 1.7 1.35 3.05 3.05 3.05s3.05-1.35 3.05-3.05v-6.3C15.05 4.15 13.7 2.8 12 2.8z" stroke="#007AFF" stroke-width="2.1"/>
    <path d="M5.9 11.4c0 3.2 2.5 5.85 5.6 6.2v2.4h1v-2.4c3.1-.35 5.6-3 5.6-6.2" stroke="#007AFF" stroke-width="2.1" stroke-linecap="round"/>
  </svg>`,
  telegramPlane: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 2L11 13" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  /* iOS SF-style chevron — thicker stroke */
  chevronBack: `<svg width="12" height="20" viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.2 1.6L1.7 10l7.5 8.4" stroke="#1C1C1E" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  checks: `<svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 5.5L4.5 8.5L10.5 2.5" stroke="#34C759" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.5 5.5L8.5 8.5L14.5 2.5" stroke="#34C759" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  signal: `<svg width="19.5" height="12" viewBox="0 0 19.5 12" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="8.5" width="3.2" height="3.5" rx="0.7" fill="currentColor"/>
    <rect x="4.8" y="6" width="3.2" height="6" rx="0.7" fill="currentColor"/>
    <rect x="9.6" y="3.2" width="3.2" height="8.8" rx="0.7" fill="currentColor"/>
    <rect x="14.4" y="0.5" width="3.2" height="11.5" rx="0.7" fill="currentColor" fill-opacity="0.35"/>
  </svg>`,
  wifi: `<svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.5" cy="10.4" r="1.15" fill="currentColor"/>
    <path d="M5.1 7.55C6.05 6.55 7.2 6 8.5 6C9.8 6 10.95 6.55 11.9 7.55" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M2.55 5.05C4.2 3.25 6.2 2.3 8.5 2.3C10.8 2.3 12.8 3.25 14.45 5.05" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M0.75 2.55C3 0.55 5.55 0 8.5 0C11.45 0 14 0.55 16.25 2.55" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
  </svg>`,
  battery: `<svg width="27" height="13" viewBox="0 0 27 13" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.6" y="0.6" width="23" height="11.8" rx="2.6" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.4"/>
    <rect x="2.1" y="2.15" width="18.5" height="8.7" rx="1.5" fill="currentColor"/>
    <path d="M25.1 4.1C25.95 4.45 26.5 5.25 26.5 6.5C26.5 7.75 25.95 8.55 25.1 8.9V4.1Z" fill="currentColor" fill-opacity="0.45"/>
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

function navAvatarBlock(url: string | null | undefined): string {
  if (url) {
    return `<div class="nav-avatar-wrap nav-glass"><img class="nav-avatar" src="${url}" alt="" /></div>`;
  }
  return `<div class="nav-avatar-wrap nav-glass nav-avatar-placeholder">${ICONS.avatarPlaceholder}</div>`;
}
function metaHtml(msg: RenderMessage, isOutgoing: boolean, variant: "inline" | "overlay"): string {
  const checks =
    isOutgoing && msg.read ? `<span class="checks" aria-hidden="true">${ICONS.checks}</span>` : "";
  return `<span class="meta meta-${variant}"><span class="time">${msg.time}</span>${checks}</span>`;
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
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"} bubble-media" style="background:${bubbleColor}">
          ${media}
          ${metaHtml(msg, isOutgoing, "overlay")}
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
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"}" style="background:${bubbleColor}">
          <div class="text">${formatChatTextHtml(msg.content)}${metaHtml(msg, isOutgoing, "inline")}</div>
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
  const wallpaperCss = params.wallpaperUrl
    ? `url("${params.wallpaperUrl}")`
    : "linear-gradient(180deg, #6ba3be 0%, #4a8fa8 100%)";

  const messageHtml = renderMessageList(messages, theme, params.clientAvatarUrl);

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
      --chat-wallpaper: ${wallpaperCss};
      width: 390px;
      height: 844px;
      position: relative;
      overflow: hidden;
    }
    /* Wallpaper + messages only — overflow here does not wrap the glass header */
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
      background-image: var(--chat-wallpaper);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      pointer-events: none;
    }

    /* Frosted header band above chat — like real Telegram iOS */
    .header-frost {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 128px;
      z-index: 8;
      pointer-events: none;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 48%, transparent 100%);
      mask-image: linear-gradient(to bottom, #000 0%, #000 48%, transparent 100%);
    }
    .header-frost::before {
      content: "";
      position: absolute;
      left: -16%;
      width: 132%;
      top: 0;
      height: 280%;
      background-image: var(--chat-wallpaper);
      background-size: cover;
      background-position: center top;
      background-repeat: no-repeat;
      filter: blur(72px) saturate(180%);
      transform: scale(1.18);
      transform-origin: center top;
    }
    .header-frost::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.22) 0%,
        rgba(255, 255, 255, 0.14) 42%,
        rgba(255, 255, 255, 0) 100%
      );
    }

    /* Strong frosted band behind input controls */
    .input-frost {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 118px;
      z-index: 15;
      pointer-events: none;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(to top, #000 0%, #000 42%, transparent 100%);
      mask-image: linear-gradient(to top, #000 0%, #000 42%, transparent 100%);
    }
    .input-frost::before {
      content: "";
      position: absolute;
      left: -16%;
      width: 132%;
      bottom: 0;
      height: 320%;
      background-image: var(--chat-wallpaper);
      background-size: cover;
      background-position: center bottom;
      background-repeat: no-repeat;
      filter: blur(80px) saturate(180%);
      transform: scale(1.2);
      transform-origin: center bottom;
    }
    .input-frost::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgba(255, 255, 255, 0.22) 0%,
        rgba(200, 230, 240, 0.12) 45%,
        rgba(255, 255, 255, 0) 100%
      );
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
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.32px;
      color: ${statusFg};
      line-height: 20px;
      min-width: 54px;
    }
    .status-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: 12px;
    }
    .tg-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #007AFF;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 3.5px 9px 3.5px 7px;
      border-radius: 13px;
      letter-spacing: 0.15px;
      line-height: 1;
      white-space: nowrap;
    }
    .tg-pill svg { flex-shrink: 0; }
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 10px 4px;
      padding: 0;
      position: relative;
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .nav-glass,
    .glass-circle,
    .input-pill {
      position: relative;
      /* Semi-transparent so strong frost band shows through — no hard outline */
      background: rgba(255, 255, 255, 0.38);
      -webkit-backdrop-filter: blur(28px) saturate(160%);
      backdrop-filter: blur(28px) saturate(160%);
      box-shadow:
        0 0.5px 0 rgba(255, 255, 255, 0.35) inset,
        0 1px 3px rgba(0, 0, 0, 0.08);
      border: none;
    }
    .glass-circle:last-child {
      background: rgba(170, 215, 240, 0.45);
    }
    .nav-back {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 4px 6px 4px 8px;
      border-radius: 17px;
      color: #000;
      font-size: 17px;
      font-weight: 400;
      letter-spacing: -0.4px;
      line-height: 1;
      flex-shrink: 0;
      z-index: 1;
    }
    .nav-back svg {
      flex-shrink: 0;
      width: 9px;
      height: 16px;
      display: block;
      overflow: visible;
    }
    .nav-center {
      position: relative;
      left: auto;
      transform: none;
      text-align: center;
      min-width: 0;
      max-width: none;
      flex: 1;
      height: 40px;
      padding: 3px 16px 2px;
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .nav-name {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.41px;
      color: #000;
      line-height: 19px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .nav-status {
      font-size: 12px;
      font-weight: 400;
      color: #8E8E93;
      letter-spacing: -0.08px;
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
    }

    /* Chat Area — wallpaper is sibling .wallpaper; spacer pins thread to input */
    .chat-bg {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow-y: auto;
      padding: 100px 7px 112px;
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

    /* Messages — even left/right columns like Telegram iOS */
    .message {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      margin-bottom: 2px;
      width: 100%;
    }
    .message.group-last { margin-bottom: 7px; }
    .message.group-first.group-last { margin-bottom: 7px; }
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
      padding: 6px 10px 5px;
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
    /* Tail only on last bubble of a group (Telegram) */
    .incoming.group-last .bubble-in { border-bottom-left-radius: 4px; }
    .outgoing.group-last .bubble-out { border-bottom-right-radius: 4px; }
    .text {
      font-size: 17px;
      line-height: 22px;
      letter-spacing: -0.41px;
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
      color: rgba(60,60,67,0.45);
      letter-spacing: 0.06px;
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
      background: rgba(0,0,0,0.28);
      line-height: 1;
      z-index: 1;
    }
    .meta-overlay .time {
      font-size: 11px;
      color: rgba(255,255,255,0.95);
      letter-spacing: 0.06px;
      text-shadow: none;
    }
    .checks {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }
    .checks svg { display: block; }
    .meta-overlay .checks path { stroke: #fff; }
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
      padding: 2px 2px 22px 2px !important;
      background: transparent !important;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13) !important;
      overflow: hidden;
      border-radius: 16px;
      line-height: 0;
      position: relative;
    }
    .outgoing.group-last .bubble-media { border-bottom-right-radius: 4px; }
    .incoming.group-last .bubble-media { border-bottom-left-radius: 4px; }
    .bubble-media .bubble-image { border-radius: 14px; margin: 0; }
    .outgoing.group-last .bubble-media .bubble-image { border-bottom-right-radius: 4px; }
    .incoming.group-last .bubble-media .bubble-image { border-bottom-left-radius: 4px; }
    .bubble-media .meta-overlay {
      bottom: 4px;
      right: 6px;
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

    /* iOS Input Bar — attach = input height; mic larger + blue */
    .input-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 10px 28px;
      display: flex;
      align-items: center;
      gap: 7px;
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
      font-weight: 500;
      color: #636366;
      letter-spacing: -0.41px;
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
    }
    .input-sticker svg {
      shape-rendering: geometricPrecision;
    }
    .nav-back-badge {
      /* Exact same height as chevron */
      min-width: 16px;
      width: 16px;
      height: 16px;
      padding: 0;
      border-radius: 50%;
      background: #000;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: -0.2px;
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
      <div class="wallpaper" aria-hidden="true"></div>
      <div class="chat-bg">
        <div class="chat-spacer" aria-hidden="true"></div>
        <div class="chat-messages">
        ${messageHtml}
        </div>
      </div>
    </div>

    <div class="header-frost" aria-hidden="true"></div>

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
          ${ICONS.chevronBack}
          <span class="nav-back-badge">1</span>
        </div>
        <div class="nav-center nav-glass">
          <div class="nav-name">${escapeHtml(clientName)}</div>
          <div class="nav-status">${escapeHtml(statusText)}</div>
        </div>
        ${navAvatarBlock(params.clientAvatarUrl)}
      </div>
    </div>

    <div class="input-frost" aria-hidden="true"></div>

    <div class="input-bar">
      <div class="glass-circle">
        ${ICONS.paperclip}
      </div>
      <div class="input-pill">
        <span class="input-placeholder">${escapeHtml(ui.inputPlaceholder)}</span>
        <div class="input-sticker">${ICONS.stickerInput}</div>
      </div>
      <div class="glass-circle">
        ${ICONS.microphone}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function getSampleMessages(locale?: string): RenderMessage[] {
  return chatUiForLocale(locale).sampleMessages.map((m) => ({ ...m }));
}
