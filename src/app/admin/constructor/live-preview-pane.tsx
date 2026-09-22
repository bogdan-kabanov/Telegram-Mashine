"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { TARGET_SCREENSHOTS } from "@/modules/chat-renderer/pagination";
import { planScrollPositions } from "@/modules/chat-renderer/scroll";
import { withBasePath } from "@/lib/base-path";
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
  captura: "captura",
  receipt: "receipt",
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
  onScreenshots?: (urls: string[]) => void;
};

const LIVE_FETCH_TIMEOUT_MS = 90_000;

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
  onScreenshots,
  onReviewId: _onReviewId,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [phoneScale, setPhoneScale] = useState(1);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sample" | "review">("sample");
  const [timeZone, setTimeZone] = useState("America/Mexico_City");
  const [clockLocal, setClockLocal] = useState("");
  const [mediaSlot, setMediaSlot] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [slidePositions, setSlidePositions] = useState<number[]>([0]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideMaxScroll, setSlideMaxScroll] = useState(0);
  const overridesKey = JSON.stringify(overrides);
  const mediaKey = JSON.stringify(mediaPaths);

  useEffect(() => {
    setClockLocal("");
    setHtml("");
    setPreviewError(null);
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
    const gen = ++fetchGenRef.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const hangTimer = window.setTimeout(() => ctrl.abort(), LIVE_FETCH_TIMEOUT_MS);

    setLoading(true);
    setPreviewError(null);
    onError(null);
    try {
      const currentLocal = clockLocal;
      const res = await fetch(withBasePath("/api/renderer/live"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(reviewId ? { reviewId } : {}),
          ...(currentLocal ? { now: currentLocal } : {}),
          overrides,
          mediaPaths,
        }),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as {
        error?: string;
        html?: string;
        timeZone?: string;
        mode?: "sample" | "review";
        reviewId?: string | null;
      };
      if (gen !== fetchGenRef.current) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось собрать превью");
      if (!data.html?.trim()) throw new Error("Пустой ответ превью");
      setHtml(data.html);
      if (data.timeZone) setTimeZone(data.timeZone);
      if (data.mode) setMode(data.mode);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      const msg = aborted
        ? "Превью не ответило за 90 с — обновите страницу или попробуйте ещё раз."
        : err instanceof Error
          ? err.message
          : "Ошибка превью";
      setPreviewError(msg);
      onError(msg);
    } finally {
      window.clearTimeout(hangTimer);
      if (gen === fetchGenRef.current) setLoading(false);
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
    setSlideIndex(0);
    setSlidePositions([0]);
    setSlideMaxScroll(0);
  }, [html]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as {
        type?: string;
        slot?: string;
        maxScroll?: number;
        clientHeight?: number;
      };
      if (!data || typeof data !== "object") return;
      if (data.type === "ctor-ready") {
        const local = clockLocal || formatDateTimeLocal(new Date(), timeZone);
        if (!clockLocal) setClockLocal(local);
        const nowIso = dateFromZonedLocal(local, timeZone).toISOString();
        const maxScroll = Math.max(0, Number(data.maxScroll) || 0);
        const clientHeight = Math.max(1, Number(data.clientHeight) || PHONE_H);
        const positions = planScrollPositions(maxScroll, clientHeight, {
          targetScreens: TARGET_SCREENSHOTS,
          minOverlapPx: 160,
        });
        const nextPositions = positions.length > 0 ? positions : [0];
        setSlideMaxScroll(maxScroll);
        setSlidePositions(nextPositions);
        setSlideIndex((prev) => {
          const clamped = Math.min(prev, nextPositions.length - 1);
          const top = nextPositions[clamped] ?? 0;
          iframeRef.current?.contentWindow?.postMessage({ type: "ctor-clock", nowIso }, "*");
          iframeRef.current?.contentWindow?.postMessage(
            { type: "ctor-scroll", top, maxScroll, nowIso },
            "*",
          );
          return clamped;
        });
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

  function goToSlide(index: number) {
    const next = Math.max(0, Math.min(index, slidePositions.length - 1));
    setSlideIndex(next);
    const top = slidePositions[next] ?? 0;
    const local = clockLocal || formatDateTimeLocal(new Date(), timeZone);
    const nowIso = dateFromZonedLocal(local, timeZone).toISOString();
    iframeRef.current?.contentWindow?.postMessage(
      { type: "ctor-scroll", top, maxScroll: slideMaxScroll, nowIso },
      "*",
    );
  }

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
        const selectedTpl =
          slot === "captura" || slot === "receipt"
            ? (mediaPaths[slot as "captura" | "receipt"] ?? undefined)
            : undefined;
        const res = await fetch(`/api/admin/reviews/${reviewId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "replaceMedia",
            slot,
            generate: true,
            rerender: true,
            now: nowIso,
            ...(selectedTpl && String(selectedTpl).includes("receipt_templates")
              ? { path: selectedTpl }
              : {}),
            ...((slot === "receipt" || slot === "captura" || slot.startsWith("bet")) &&
            Number.isFinite(Number(amountDraft.replace(",", "."))) &&
            Number(amountDraft.replace(",", ".")) > 0
              ? { amount: Number(amountDraft.replace(",", ".")) }
              : {}),
          }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          error?: string;
          path?: string;
          source?: string;
          screenshots?: string[];
        };
        if (!res.ok) throw new Error(data.error ?? "Не удалось перегенерировать");
        if (data.path) onMediaPaths({ ...mediaPaths, [slot]: data.path });
        if (data.screenshots?.length) onScreenshots?.(data.screenshots);
        if (data.source === "template") {
          onError(
            "ИИ не смог отредактировать чек — показан исходный шаблон без замены суммы.",
          );
        } else if (data.source === "html") {
          onError("Чек собран HTML-заглушкой (ИИ недоступен).");
        } else if (data.source === "overlay") {
          onError("OCR-штамп (режим Чеки=off). Для правки через ИИ включи always в /admin/ai.");
        } else if (data.source === "ai") {
          onError(null);
        }
      } else {
        const kind = SLOT_GENERATE_KIND[slot];
        if (!kind) {
          throw new Error("Этот тип медиа нельзя пересобрать здесь.");
        }
        const slipAmount =
          Number.isFinite(Number(amountDraft.replace(",", "."))) &&
          Number(amountDraft.replace(",", ".")) > 0
            ? Number(amountDraft.replace(",", "."))
            : slot === "captura"
              ? amountDefaults?.deposit
              : slot === "receipt"
                ? amountDefaults?.payout
                : undefined;
        const res = await fetch("/api/admin/media/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            count: 1,
            projectId,
            slot,
            now: nowIso,
            ...(kind === "captura" || kind === "receipt"
              ? {
                  ...(mediaPaths[slot as "captura" | "receipt"]
                    ? { sourcePath: mediaPaths[slot as "captura" | "receipt"] }
                    : {}),
                  ...(slipAmount && slipAmount > 0 ? { amount: slipAmount } : {}),
                  ...(amountDefaults?.deposit ? { deposit: amountDefaults.deposit } : {}),
                  ...(amountDefaults?.profitFinal ? { profitFinal: amountDefaults.profitFinal } : {}),
                }
              : {}),
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
          source?: string;
          assets?: Array<{ path: string }>;
          message?: string;
        };
        if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка ИИ");
        const path = data.path ?? data.assets?.[0]?.path;
        if (path) onMediaPaths({ ...mediaPaths, [slot]: path });
        if (data.source === "template") {
          onError(
            "Не удалось прочитать поля на скрине — показан исходный шаблон без замены суммы/имён.",
          );
        } else if (kind === "captura" || kind === "receipt") {
          onError(data.message ?? null);
        }
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
              : "Имя, статус, аватар, фон, цвета и тексты — сразу в телефоне"}
            {" · "}
            {tzShort} · HH:mm
          </span>
        </div>
        {loading ? <em className="ctor-live-busy">обновляем…</em> : null}
        {!loading && previewError ? (
          <button type="button" className="admin-btn-ghost ctor-live-retry" onClick={() => void fetchHtml()}>
            Повторить
          </button>
        ) : null}
      </div>

      {previewError ? (
        <p className="ctor-live-error" role="alert">
          {previewError}
        </p>
      ) : null}

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
            <div className="ctor-live-placeholder">
              {loading ? "Собираем чат…" : previewError ? "Ошибка превью" : "Нет превью"}
            </div>
          )}
        </div>
        {mediaSlot ? (
          <div className="ctor-live-media ctor-live-media-onphone">
            <strong>{SLOT_LABELS[mediaSlot] ?? mediaSlot}</strong>
            <p>
              {mediaSlot === "receipt" || mediaSlot === "captura"
                ? mediaSlot === "captura"
                  ? "На исходном шаблоне OXXO/банка проставятся сумма депозита, дата (время слева) и хвост карты. Полный отзыв не нужен."
                  : "На исходном шаблоне проставятся сумма выплаты, дата и имена. Полный отзыв не обязателен."
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
                {mediaBusy
                  ? "Печать…"
                  : mediaSlot === "captura"
                    ? "Проставить депозит"
                    : mediaSlot === "receipt"
                      ? "Проставить выплату"
                      : "Перепечатать поля"}
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

      {slidePositions.length > 1 ? (
        <div className="ctor-live-slides" role="tablist" aria-label="Экраны альбома">
          {slidePositions.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === slideIndex}
              className={`ctor-live-slide${i === slideIndex ? " is-active" : ""}`}
              onClick={() => goToSlide(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ctor-live-pager">
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={slideIndex <= 0}
          onClick={() => goToSlide(slideIndex - 1)}
        >
          ← Назад
        </button>
        <span>
          Экран {slideIndex + 1} / {Math.max(1, slidePositions.length)}
        </span>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={slideIndex >= slidePositions.length - 1}
          onClick={() => goToSlide(slideIndex + 1)}
        >
          Далее →
        </button>
      </div>

      <p className="ctor-live-hint">
        Листайте экраны как в альбоме канала (до {TARGET_SCREENSHOTS}). В примере уже есть фото,
        условия, ставки и чеки — клик по кадру слева или справа заменяет его.
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
