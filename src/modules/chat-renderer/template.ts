import type { ProjectConfig, ProjectTheme } from "@/lib/schemas/projects";

export interface RenderMessage {
  id: string;
  role: "client" | "manager";
  type: "text" | "image" | "sticker";
  content: string;
  time: string;
  read?: boolean;
  imageUrl?: string;
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
  paperclip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.5 6.5V14.5C16.5 17.26 14.26 19.5 11.5 19.5C8.74 19.5 6.5 17.26 6.5 14.5V6.5C6.5 4.57 8.07 3 10 3C11.93 3 13.5 4.57 13.5 6.5V13.5C13.5 14.33 12.83 15 12 15C11.17 15 10.5 14.33 10.5 13.5V7.5" stroke="#8E8E93" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  stickerInput: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8.6" stroke="#AEAEB2" stroke-width="1.35"/>
    <path d="M14.2 4.8C10.8 4.8 8.8 8 8.8 12C8.8 16 10.8 19.2 14.2 19.2" stroke="#AEAEB2" stroke-width="1.35" stroke-linecap="round"/>
  </svg>`,
  microphone: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="#007AFF" stroke-width="1.6"/>
    <path d="M6 11.5C6 14.53 8.24 17 11 17H13C15.76 17 18 14.53 18 11.5" stroke="#007AFF" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12 17V20.5" stroke="#007AFF" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M9.5 20.5H14.5" stroke="#007AFF" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  telegramPlane: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 2L11 13" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  chevronBack: `<svg width="8" height="14" viewBox="0 0 8 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 1L1 7L7 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  checks: `<svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 5.5L4.5 8.5L10.5 2.5" stroke="#34C759" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.5 5.5L8.5 8.5L14.5 2.5" stroke="#34C759" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  signal: `<svg width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="7.5" width="3" height="4" rx="0.6" fill="#000"/>
    <rect x="5" y="5.5" width="3" height="6" rx="0.6" fill="#000"/>
    <rect x="9.5" y="3.5" width="3" height="8" rx="0.6" fill="#000"/>
    <rect x="14" y="1.5" width="3" height="10" rx="0.6" fill="#000" fill-opacity="0.28"/>
  </svg>`,
  wifi: `<svg width="16" height="12" viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 10.2C8.55 10.2 9 9.75 9 9.2C9 8.65 8.55 8.2 8 8.2C7.45 8.2 7 8.65 7 9.2C7 9.75 7.45 10.2 8 10.2Z" fill="#000"/>
    <path d="M4.8 6.4C6 5.2 7.4 4.6 8 4.6C8.6 4.6 10 5.2 11.2 6.4" stroke="#000" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M1.6 3.2C3.6 1.2 6.2 0 8 0C9.8 0 12.4 1.2 14.4 3.2" stroke="#000" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  </svg>`,
  battery: `<svg width="27" height="13" viewBox="0 0 27 13" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="22" height="12" rx="3" stroke="#000" stroke-opacity="0.35"/>
    <rect x="2" y="2" width="18" height="9" rx="2" fill="#000"/>
    <path d="M24.5 4.5V8.5C25.5 8.1 26 7.2 26 6.5C26 5.8 25.5 4.9 24.5 4.5Z" fill="#000" fill-opacity="0.4"/>
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
    return `<img class="nav-avatar" src="${url}" alt="" />`;
  }
  return `<div class="nav-avatar nav-avatar-placeholder">${ICONS.avatarPlaceholder}</div>`;
}

function renderBubble(msg: RenderMessage, theme: ProjectTheme, clientAvatarUrl?: string | null): string {
  const isOutgoing = msg.role === "manager";
  const bubbleColor = isOutgoing
    ? msg.type === "image"
      ? theme.outgoingBubbleAlt ?? theme.outgoingBubble
      : theme.outgoingBubble
    : theme.incomingBubble;

  const checks = isOutgoing && msg.read ? `<span class="checks">${ICONS.checks}</span>` : "";

  if (msg.type === "sticker" && msg.imageUrl) {
    return `
    <div class="message ${isOutgoing ? "outgoing" : "incoming"}">
      ${!isOutgoing ? avatarBlock(clientAvatarUrl, "C") : ""}
      <div class="bubble-wrap">
        <div class="sticker-wrap">
          <img class="sticker-image" src="${msg.imageUrl}" alt="" />
          <span class="sticker-time">${msg.time}</span>
        </div>
      </div>
    </div>
  `;
  }

  const body =
    msg.type === "image" && msg.imageUrl
      ? `<img class="bubble-image" src="${msg.imageUrl}" alt="" />`
      : msg.type === "image"
        ? `<div class="image-placeholder">📷 ${escapeHtml(msg.content)}</div>`
        : `<span class="text">${escapeHtml(msg.content)}</span>`;

  return `
    <div class="message ${isOutgoing ? "outgoing" : "incoming"}">
      ${!isOutgoing ? avatarBlock(clientAvatarUrl, "C") : ""}
      <div class="bubble-wrap">
        <div class="bubble ${isOutgoing ? "bubble-out" : "bubble-in"}" style="background:${bubbleColor}">
          ${body}
          <span class="time">${msg.time}</span>
        </div>
        ${isOutgoing ? `<div class="meta-out">${checks}</div>` : ""}
      </div>
    </div>
  `;
}

export function buildChatHtml(params: RenderChatParams): string {
  const {
    project,
    clientName,
    messages,
    statusText = "últ. vez recientemente",
    statusBarTime = "18:55",
  } = params;
  const theme = project.theme;
  const accent = theme.accentColor ?? "#34C759";
  const wallpaper = params.wallpaperUrl
    ? `background-image:url("${params.wallpaperUrl}");`
    : "background: linear-gradient(180deg, #6ba3be 0%, #4a8fa8 100%);";

  const messageHtml = messages.map((m) => renderBubble(m, theme, params.clientAvatarUrl)).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    body {
      width: 390px;
      height: 844px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif;
      overflow: hidden;
      background: #000;
    }
    .phone {
      width: 390px;
      height: 844px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    /* Header block — status + nav */
    .header-wrap {
      position: relative;
      z-index: 10;
      background: linear-gradient(180deg,
        #fafdfe 0%,
        #e8f5f8 48%,
        #d4ecf2 100%);
      border-bottom: 0.33px solid rgba(60, 60, 67, 0.18);
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
      color: #000;
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

    /* Navigation Bar */
    .nav-bar {
      height: 44px;
      display: flex;
      align-items: center;
      padding: 0 8px 4px;
      position: relative;
    }
    .nav-back {
      display: flex;
      align-items: center;
      gap: 2px;
      color: ${accent};
      font-size: 17px;
      font-weight: 400;
      letter-spacing: -0.4px;
      line-height: 1;
      flex-shrink: 0;
      z-index: 1;
    }
    .nav-back svg { color: ${accent}; flex-shrink: 0; width: 7px; height: 13px; margin-top: 0; }
    .nav-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      min-width: 0;
      max-width: 58%;
      pointer-events: none;
    }
    .nav-name {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.41px;
      color: #000;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nav-status {
      font-size: 13px;
      font-weight: 400;
      color: #8E8E93;
      letter-spacing: -0.08px;
      line-height: 16px;
      margin-top: 1px;
    }
    .nav-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-left: auto;
      z-index: 1;
    }
    .nav-avatar-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #C4C4C6;
      margin-left: auto;
      z-index: 1;
    }
    .nav-avatar-placeholder svg {
      width: 36px;
      height: 36px;
    }

    /* Chat Area */
    .chat-bg {
      flex: 1;
      overflow-y: auto;
      padding: 6px 10px 62px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      ${wallpaper}
    }

    /* Messages */
    .message {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      margin-bottom: 2px;
    }
    .message.outgoing { justify-content: flex-end; }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-bottom: 2px;
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
    .bubble-wrap { max-width: 78%; display: flex; flex-direction: column; }
    .message.outgoing .bubble-wrap { align-items: flex-end; }
    .bubble {
      padding: 7px 12px 5px;
      position: relative;
      display: inline-block;
      max-width: 100%;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    }
    .bubble-in {
      border-radius: 18px;
      border-bottom-left-radius: 4px;
    }
    .bubble-out {
      border-radius: 18px;
      border-bottom-right-radius: 4px;
    }
    .text {
      font-size: 17px;
      line-height: 22px;
      letter-spacing: -0.4px;
      color: #000;
      word-wrap: break-word;
      padding-right: 44px;
      display: block;
    }
    .bubble .time {
      font-size: 11px;
      color: rgba(60,60,67,0.45);
      letter-spacing: -0.1px;
      position: absolute;
      bottom: 5px;
      right: 10px;
      white-space: nowrap;
    }
    .meta-out {
      display: flex;
      align-items: center;
      margin-top: 1px;
      margin-right: 4px;
    }
    .checks { display: flex; align-items: center; }
    .image-placeholder {
      background: rgba(0,0,0,0.06);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      font-size: 14px;
      color: #666;
      min-width: 200px;
    }
    .bubble-image {
      display: block;
      max-width: 240px;
      border-radius: 12px;
      margin-bottom: 2px;
    }
    .bubble:has(.bubble-image) {
      padding: 4px;
      background: transparent !important;
      box-shadow: none;
    }
    .bubble:has(.bubble-image) .time {
      bottom: 8px;
      right: 14px;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .sticker-wrap {
      position: relative;
      display: inline-block;
      max-width: 180px;
    }
    .sticker-image {
      display: block;
      width: 168px;
      height: auto;
      object-fit: contain;
    }
    .sticker-time {
      position: absolute;
      bottom: 4px;
      right: 6px;
      font-size: 11px;
      color: rgba(255,255,255,0.92);
      text-shadow: 0 1px 2px rgba(0,0,0,0.55);
      white-space: nowrap;
    }

    /* iOS Input Bar — glassmorphism */
    .input-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 8px 28px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 20;
    }
    .glass-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 0.5px 0 rgba(0,0,0,0.08);
    }
    .glass-circle-blue {
      background: rgba(200,220,255,0.75);
    }
    .input-pill {
      flex: 1;
      height: 40px;
      border-radius: 20px;
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      padding: 0 12px 0 16px;
      box-shadow: 0 0.5px 0 rgba(0,0,0,0.08);
      min-width: 0;
    }
    .input-placeholder {
      flex: 1;
      font-size: 17px;
      color: #8E8E93;
      letter-spacing: -0.4px;
    }
    .input-sticker {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div class="phone">
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
        <div class="nav-back">
          ${ICONS.chevronBack}
          <span>Atrás</span>
        </div>
        <div class="nav-center">
          <div class="nav-name">${escapeHtml(clientName)}</div>
          <div class="nav-status">${escapeHtml(statusText)}</div>
        </div>
        ${navAvatarBlock(params.clientAvatarUrl)}
      </div>
    </div>

    <div class="chat-bg">
      ${messageHtml}
    </div>

    <div class="input-bar">
      <div class="glass-circle">${ICONS.paperclip}</div>
      <div class="input-pill">
        <span class="input-placeholder">Mensaje</span>
        <div class="input-sticker">${ICONS.stickerInput}</div>
      </div>
      <div class="glass-circle glass-circle-blue">${ICONS.microphone}</div>
    </div>
  </div>
</body>
</html>`;
}

export function getSampleMessages(): RenderMessage[] {
  return [
    {
      id: "1",
      role: "client",
      type: "text",
      content: "Necesito tu ayuda",
      time: "17:08",
    },
    {
      id: "2",
      role: "client",
      type: "text",
      content: "Me lesioné en el trabajo",
      time: "17:08",
    },
    {
      id: "3",
      role: "client",
      type: "text",
      content: "No tengo dinero para pagar el tratamiento",
      time: "17:08",
    },
    {
      id: "4",
      role: "manager",
      type: "text",
      content: "Hola\nTe lo contaré todo",
      time: "17:09",
      read: true,
    },
  ];
}
