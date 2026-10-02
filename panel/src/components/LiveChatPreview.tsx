import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const PHONE_W = 390;
const PHONE_H = 844;

export type LivePreviewOverrides = {
  managerName?: string;
  managerHandle?: string;
  incomingBubble?: string;
  outgoingBubble?: string;
  accentColor?: string;
  depositMessageTemplate?: string;
  completionMessageTemplate?: string;
  payoutMessageTemplate?: string;
  wallpaperPath?: string | null;
  clientAvatarPath?: string | null;
};

type Props = {
  projectId: string;
  /** When set — shows that review (no new generation). */
  reviewId?: string | null;
  overrides?: LivePreviewOverrides;
  /** Compact height for drawers */
  compact?: boolean;
};

/**
 * Live Telegram HTML preview via /api/renderer/live.
 * Does NOT run full review pipeline (no OpenAI dialog + Playwright album).
 */
export function LiveChatPreview({ projectId, reviewId, overrides, compact }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sample" | "review">("sample");
  const [scale, setScale] = useState(0.72);
  const overridesKey = JSON.stringify(overrides ?? {});

  const fetchPreview = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        html?: string;
        mode?: "sample" | "review";
        error?: string;
      }>("/api/renderer/live", {
        method: "POST",
        json: {
          projectId,
          ...(reviewId ? { reviewId } : {}),
          ...(overrides ? { overrides } : {}),
        },
      });
      if (gen !== genRef.current) return;
      if (!data.html?.trim()) throw new Error("Пустой ответ превью");
      setHtml(data.html);
      if (data.mode) setMode(data.mode);
    } catch (e) {
      if (gen !== genRef.current) return;
      setError(e instanceof Error ? e.message : "Ошибка превью");
      setHtml("");
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [projectId, reviewId, overrides]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchPreview();
    }, 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reviewId, overridesKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const maxH = compact ? 520 : 680;
      const byW = w / PHONE_W;
      const byH = maxH / PHONE_H;
      setScale(Math.min(1, byW, byH));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div className="live-preview">
      <div className="live-preview-head">
        <div>
          <strong>Превью чата</strong>
          <span className="muted">
            {mode === "review"
              ? " · сохранённый отзыв (без новой генерации)"
              : " · пример по настройкам (не пробный отзыв)"}
          </span>
        </div>
        <button type="button" className="btn sm" disabled={loading} onClick={() => void fetchPreview()}>
          {loading ? "…" : "Обновить"}
        </button>
      </div>
      {error ? <div className="err">{error}</div> : null}
      <div ref={wrapRef} className="live-preview-stage">
        <div
          className="live-preview-phone"
          style={{
            width: PHONE_W * scale,
            height: PHONE_H * scale,
          }}
        >
          <iframe
            ref={iframeRef}
            title="Превью Telegram"
            className="live-preview-iframe"
            style={{
              width: PHONE_W,
              height: PHONE_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
          {loading ? <div className="live-preview-busy">Собираем превью…</div> : null}
        </div>
      </div>
      <p className="muted live-preview-foot">
        Не тратит полный пайплайн (диалог ИИ + альбом скринов). Для финальных PNG — «Пробный отзыв».
      </p>
    </div>
  );
}
