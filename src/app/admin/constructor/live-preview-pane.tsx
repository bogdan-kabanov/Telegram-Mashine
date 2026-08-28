"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { TARGET_SCREENSHOTS } from "@/modules/chat-renderer/pagination";
import { dateFromZonedLocal, formatDateTimeLocal } from "@/lib/timezone";

import { HelpTip } from "../ui/HelpTip";
import type { PickerMediaAsset } from "../ui/MediaPicker";

const PHONE_W = 390;
const PHONE_H = 844;

export type LiveOverrides = {
  managerName: string;
  managerHandle: string;
  incomingBubble: string;
  outgoingBubble: string;
  accentColor: string;
  depositMessageTemplate?: string;
  completionMessageTemplate?: string;
  payoutMessageTemplate?: string;
  wallpaperPath?: string | null;
  clientAvatarPath?: string | null;
};

export type LiveMediaPaths = {
  avatar?: string | null;
  storyPhoto?: string | null;
  conditions?: string | null;
  bet1?: string | null;
  bet2?: string | null;
  bet3?: string | null;
  receipt?: string | null;
  captura?: string | null;
  sticker?: string | null;
};

const SLOT_LABELS: Record<string, string> = {
  avatar: "Аватар в шапке",
  storyPhoto: "Фото клиента",
  conditions: "Условия",
  bet1: "Ставка 1",
  bet2: "Ставка 2",
  bet3: "Ставка 3",
  receipt: "Чек выплаты",
  captura: "Чек депозита",
  sticker: "Стикер",
};

const SLOT_GENERATE_KIND: Record<string, string> = {
  avatar: "avatar",
  storyPhoto: "story_photo",
  conditions: "conditions",
  bet1: "bet",
  bet2: "bet",
  bet3: "bet",
  sticker: "sticker",
};

type Props = {
  projectId: string;
  locale: string;
  reviewId: string;
  overrides: LiveOverrides;
  mediaPaths: LiveMediaPaths;
  onReviewId: (id: string) => void;
  onMediaPaths: (next: LiveMediaPaths) => void;
  onPickMedia: (slot: string) => void;
  onError: (message: string | null) => void;
  onSlideTimes: (iso: string[]) => void;
  amountDefaults?: {
    currency: string;
    deposit: number | null;
    payout: number | null;
    profit1?: number | null;
    profit2?: number | null;
    profit3?: number | null;
    profitFinal?: number | null;
  };
};

export function LivePreviewPane({
  projectId,
  locale,
  reviewId,
  overrides,
  mediaPaths,
  onReviewId,
  onMediaPaths,
  onPickMedia,
  onError,
  onSlideTimes,
  amountDefaults,
  onReviewId: _onReviewId,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phoneScale, setPhoneScale] = useState(1);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"sample" | "review">("sample");
  const [timeZone, setTimeZone] = useState("America/Mexico_City");
  const [clockLocal, setClockLocal] = useState("");
  const [mediaSlot, setMediaSlot] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const overridesKey = JSON.stringify(overrides);
  const mediaKey = JSON.stringify(mediaPaths);

  useEffect(() => {
    setClockLocal("");
    setHtml("");
  }, [projectId]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setPhoneScale(Math.min(1, w / PHONE_W));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchHtml = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const currentLocal = clockLocal;
      const res = await fetch("/api/renderer/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(reviewId ? { reviewId } : {}),
          ...(currentLocal ? { now: currentLocal } : {}),
          overrides,
          mediaPaths,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        html?: string;
        timeZone?: string;
        mode?: "sample" | "review";
        reviewId?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Не удалось собрать превью");
      setHtml(data.html ?? "");
      if (data.timeZone) setTimeZone(data.timeZone);
      if (data.mode) setMode(data.mode);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ошибка превью");
    } finally {
      setLoading(false);
    }
  }, [projectId, reviewId, overrides, mediaPaths, clockLocal, onError]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchHtml();
    }, 180);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reviewId, overridesKey, mediaKey]);

  useEffect(() => {
    if (!clockLocal) return;
    const iso = dateFromZonedLocal(clockLocal, timeZone).toISOString();
    onSlideTimes(Array.from({ length: TARGET_SCREENSHOTS }, () => iso));
  }, [clockLocal, timeZone, onSlideTimes]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const wrap = wrapRef.current;
      const iframe = iframeRef.current;
      if (!wrap || !iframe) return;
      const r = wrap.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      iframe.contentWindow?.postMessage({ type: "ctor-wheel", deltaY: e.deltaY }, "*");
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [html]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as {
        type?: string;
        slot?: string;
      };
      if (!data || typeof data !== "object") return;
      if (data.type === "ctor-ready") {
        const local = clockLocal || formatDateTimeLocal(new Date(), timeZone);
        if (!clockLocal) setClockLocal(local);
        const nowIso = dateFromZonedLocal(local, timeZone).toISOString();
        iframeRef.current?.contentWindow?.postMessage({ type: "ctor-clock", nowIso }, "*");
        iframeRef.current?.contentWindow?.postMessage({ type: "ctor-scroll", top: 0 }, "*");
      }
      if (data.type === "ctor-media" && data.slot) {
        setMediaSlot(data.slot);
        if (data.slot === "captura") {
          setAmountDraft(amountDefaults?.deposit != null ? String(amountDefaults.deposit) : "");
        } else if (data.slot === "receipt") {
          setAmountDraft(amountDefaults?.payout != null ? String(amountDefaults.payout) : "");
        } else if (data.slot === "bet1") {
          setAmountDraft(amountDefaults?.profit1 != null ? String(amountDefaults.profit1) : "");
        } else if (data.slot === "bet2") {
          setAmountDraft(amountDefaults?.profit2 != null ? String(amountDefaults.profit2) : "");
        } else if (data.slot === "bet3") {
          setAmountDraft(
            amountDefaults?.profit3 != null
              ? String(amountDefaults.profit3)
              : amountDefaults?.profitFinal != null
                ? String(amountDefaults.profitFinal)
                : amountDefaults?.payout != null
                  ? String(amountDefaults.payout)
                  : "",
          );
        } else {
          setAmountDraft("");
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [clockLocal, timeZone, amountDefaults]);

  function setClock(value: string) {
    setClockLocal(value);
    const nowIso = dateFromZonedLocal(value, timeZone).toISOString();
    iframeRef.current?.contentWindow?.postMessage({ type: "ctor-clock", nowIso }, "*");
    if (reviewId) {
      window.setTimeout(() => {
        const iso = dateFromZonedLocal(value, timeZone).toISOString();
        void fetch(`/api/admin/reviews/${reviewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slideTimes: Array.from({ length: TARGET_SCREENSHOTS }, () => iso),
          }),
        });
      }, 500);
    }
  }

  async function regenerateSlot(slot: string) {
    setMediaBusy(true);
    onError(null);
    const ctrl = new AbortController();
    const hangTimer = window.setTimeout(() => ctrl.abort(), 90_000);
    try {
      const local = clockLocal || formatDateTimeLocal(new Date(), timeZone);
      const nowIso = dateFromZonedLocal(local, timeZone).toISOString();
      if (slot === "avatar") {
        const res = await fetch("/api/admin/media/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "avatar", count: 1, projectId }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { error?: string; path?: string };
        if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка ИИ");
        if (data.path) {
          await fetch(`/api/admin/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientAvatarPath: data.path }),
          });
          onMediaPaths({ ...mediaPaths, avatar: data.path });
        }
        setMediaSlot(null);
        return;
      }
      if (reviewId) {
        const res = await fetch(`/api/admin/reviews/${reviewId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "replaceMedia",
            slot,
            generate: true,
            now: nowIso,
            ...((slot === "receipt" || slot === "captura" || slot.startsWith("bet")) &&
            Number.isFinite(Number(amountDraft.replace(",", "."))) &&
            Number(amountDraft.replace(",", ".")) > 0
              ? { amount: Number(amountDraft.replace(",", ".")) }
              : {}),
          }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { error?: string; path?: string; source?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось перегенерировать");
        if (data.path) onMediaPaths({ ...mediaPaths, [slot]: data.path });
        if (data.source === "template") {
          onError(
            "Не удалось прочитать поля на скрине — показан исходный шаблон без замены суммы/имён.",
          );
        } else if (data.source === "html") {
          onError("Чек собран HTML-заглушкой: на шаблоне не нашлись поля для подстановки.");
        }
      } else {
        const kind = SLOT_GENERATE_KIND[slot];
        if (!kind) {
          throw new Error("Этот тип медиа появится после сборки полного отзыва (чеки).");
        }
        const res = await fetch("/api/admin/media/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            count: 1,
            projectId,
            slot,
            ...(kind === "bet"
              ? {
                  ...(mediaPaths[slot as keyof LiveMediaPaths]
                    ? { sourcePath: mediaPaths[slot as keyof LiveMediaPaths] }
                    : {}),
                  ...(amountDefaults?.deposit ? { deposit: amountDefaults.deposit } : {}),
                  ...(amountDefaults?.profit1 ? { profit1: amountDefaults.profit1 } : {}),
                  ...(amountDefaults?.profit2 ? { profit2: amountDefaults.profit2 } : {}),
                  ...(amountDefaults?.profit3 ? { profit3: amountDefaults.profit3 } : {}),
                  ...(amountDefaults?.profitFinal ? { profitFinal: amountDefaults.profitFinal } : {}),
                  ...(Number.isFinite(Number(amountDraft.replace(",", "."))) &&
                  Number(amountDraft.replace(",", ".")) > 0
                    ? { profit: Number(amountDraft.replace(",", ".")) }
                    : {}),
                }
              : {}),
          }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          error?: string;
          path?: string;
          assets?: Array<{ path: string }>;
        };
        if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка ИИ");
        const path = data.path ?? data.assets?.[0]?.path;
        if (path) onMediaPaths({ ...mediaPaths, [slot]: path });
      }
      setMediaSlot(null);
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      onError(
        aborted
          ? "Печать зависла — OCR не ответил. Обновите страницу и нажмите ещё раз."
          : err instanceof Error
            ? err.message
            : "Ошибка медиа",
      );
    } finally {
      window.clearTimeout(hangTimer);
      setMediaBusy(false);
    }
  }

  const tzShort = useMemo(() => timeZone.replace(/_/g, " ").split("/").pop() ?? timeZone, [timeZone]);
  const currentLocal = clockLocal || formatDateTimeLocal(new Date(), timeZone);

  return (
    <aside className="ctor-live" aria-label="Живой отзыв 1:1">
      <div className="ctor-live-head">
        <div>
          <strong>Справа — то, что слева</strong>
          <span>
            {mode === "review"
              ? "Тот же HTML, что уйдёт в канал"
              : "Имя, ник, аватар, фон, цвета и тексты — сразу в телефоне"}
            {" · "}
            {tzShort} · HH:mm
          </span>
        </div>
        {loading ? <em className="ctor-live-busy">обновляем…</em> : null}
      </div>

      <div
        ref={wrapRef}
        className="ctor-live-phone-wrap"
        style={{ height: PHONE_H * phoneScale }}
      >
        <div className="ctor-live-phone" style={{ transform: `scale(${phoneScale})` }}>
          {html ? (
            <iframe
              ref={iframeRef}
              className="ctor-live-iframe"
              title="Превью отзыва"
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="ctor-live-placeholder">{loading ? "Собираем чат…" : "Нет превью"}</div>
          )}
        </div>
        {mediaSlot ? (
          <div className="ctor-live-media ctor-live-media-onphone">
            <strong>{SLOT_LABELS[mediaSlot] ?? mediaSlot}</strong>
            <p>
              {mediaSlot === "receipt" || mediaSlot === "captura"
                ? "На этом же скрине банка заменятся сумма, имена, дата и 4 цифры. Новую фотку не рисуем."
                : mediaSlot === "storyPhoto"
                  ? "Фото клиента генерируется без текста и имён — это кадр из жизни, не документ."
                  : mediaSlot.startsWith("bet")
                    ? "На этом же скрине ставки заменятся депозит и прибыль. Новую фотку не рисуем."
                    : "Только этот кадр. Весь отзыв не пересобирается."}
            </p>
            {mediaSlot === "receipt" || mediaSlot === "captura" || mediaSlot.startsWith("bet") ? (
              <label className="ctor-live-amount">
                <span>
                  {mediaSlot.startsWith("bet") ? "Прибыль на ставке" : "Сумма на чеке"}
                  {amountDefaults?.currency ? ` (${amountDefaults.currency})` : ""}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amountDraft}
                  placeholder={
                    mediaSlot === "captura"
                      ? "депозит"
                      : mediaSlot.startsWith("bet")
                        ? "прибыль"
                        : "выплата"
                  }
                  onChange={(e) => setAmountDraft(e.target.value)}
                />
              </label>
            ) : null}
            <div className="ctor-live-media-actions">
              <button
                type="button"
                className="admin-btn"
                disabled={mediaBusy}
                onClick={() => void regenerateSlot(mediaSlot)}
              >
                {mediaBusy ? "Печать…" : "Перепечатать поля"}
              </button>
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={mediaBusy}
                onClick={() => onPickMedia(mediaSlot)}
              >
                Из медиатеки
              </button>
              <button type="button" className="admin-btn-ghost" onClick={() => setMediaSlot(null)}>
                Закрыть
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <label className="ctor-live-time">
        <span>
          Время в чате
          <HelpTip text="Часы статус-бара, пузырей и чеков. Часовой пояс проекта, формат HH:mm." />
        </span>
        <input
          type="datetime-local"
          value={currentLocal}
          onChange={(e) => setClock(e.target.value)}
        />
      </label>

      <p className="ctor-live-hint">
        Наведите на телефон и крутите колёсико — диалог с первого сообщения до последнего. Клик по
        фото, чеку, ставке или аватару — заменить.
      </p>
    </aside>
  );
}

export function applyLibraryPick(
  slot: string,
  asset: PickerMediaAsset,
  current: LiveMediaPaths,
): LiveMediaPaths {
  return { ...current, [slot]: asset.path };
}

export function slideTimesIso(locals: string[], timeZone: string): string[] {
  return locals.map((l) => dateFromZonedLocal(l, timeZone).toISOString());
}
