"use client";

import { useCallback, useEffect, useState } from "react";

import { colors } from "./styles";
import { HelpTip } from "./ui/HelpTip";

type DialogMessage = {
  id: string;
  role: "client" | "manager";
  type: string;
  content: string;
  delayMinutes: number;
};

type ReviewDialogPayload = {
  id: string;
  clientName: string;
  publishedAt: string | null;
  dialog?: {
    messages: DialogMessage[];
    legendId?: string;
  };
  dialogTranslations?: Record<string, string>;
  screenshots: string[];
};

const MEDIA_LABELS: Record<string, string> = {
  image: "📷 Фото клиента",
  conditions: "📋 Условия",
  bet: "📈 Ставка",
  receipt: "🧾 Чек выплаты",
  captura: "🧾 Чек депозита",
  sticker: "🎟 Стикер",
};

type Props = {
  reviewId: string;
  onScreenshotsChange: (urls: string[]) => void;
  onError: (message: string | null) => void;
};

export function DialogReviewPanel({ reviewId, onScreenshotsChange, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewDialogPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!reviewId) {
      setReview(null);
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`);
      const data = (await res.json()) as { error?: string; review?: ReviewDialogPayload };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить отзыв");
      const r = data.review ?? null;
      setReview(r);
      const next: Record<string, string> = {};
      for (const m of r?.dialog?.messages ?? []) {
        if (m.type === "text") next[m.id] = m.content;
      }
      setDrafts(next);
      setDirty(false);
      if (r?.screenshots) onScreenshotsChange(r.screenshots);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ошибка загрузки диалога");
    } finally {
      setLoading(false);
    }
  }, [reviewId, onError, onScreenshotsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdits() {
    if (!review?.dialog) return;
    setBusy("save");
    onError(null);
    try {
      const messages = review.dialog.messages.map((m) =>
        m.type === "text" && drafts[m.id] != null ? { ...m, content: drafts[m.id]! } : m,
      );
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = (await res.json()) as { error?: string; review?: ReviewDialogPayload };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      setReview(data.review ?? review);
      setDirty(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "translate" | "rerender" | "publish") {
    if (dirty && action !== "translate") {
      await saveEdits();
    }
    setBusy(action);
    onError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetLocale: "ru-RU" }),
      });
      const data = (await res.json()) as {
        error?: string;
        review?: ReviewDialogPayload;
        screenshots?: string[];
        dialogTranslations?: Record<string, string>;
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (data.review) {
        setReview(data.review);
        if (data.review.dialog) {
          const next: Record<string, string> = {};
          for (const m of data.review.dialog.messages) {
            if (m.type === "text") next[m.id] = m.content;
          }
          setDrafts(next);
        }
      } else if (data.dialogTranslations && review) {
        setReview({ ...review, dialogTranslations: data.dialogTranslations });
      }
      if (data.screenshots) onScreenshotsChange(data.screenshots);
      else if (data.review?.screenshots) onScreenshotsChange(data.review.screenshots);
      setDirty(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  if (!reviewId) {
    return (
      <p style={{ margin: "0.75rem 0 0", color: colors.muted, fontSize: "0.875rem" }}>
        Сначала сгенерируйте пробный отзыв — здесь появится диалог.
      </p>
    );
  }

  if (loading) {
    return (
      <p style={{ margin: "0.75rem 0 0", color: colors.muted, fontSize: "0.875rem" }}>
        Загрузка диалога…
      </p>
    );
  }

  if (!review?.dialog) {
    return (
      <p style={{ margin: "0.75rem 0 0", color: colors.muted, fontSize: "0.875rem" }}>
        У этого отзыва нет сохранённого диалога (старый пакет). Нажмите «Сделать пробный отзыв»
        ещё раз.
      </p>
    );
  }

  const translations = review.dialogTranslations ?? {};

  return (
    <div style={{ marginTop: "1rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.45rem",
          marginBottom: "0.65rem",
        }}
      >
        <strong style={{ fontSize: "0.9rem" }}>Диалог · {review.clientName}</strong>
        <HelpTip text="Оригинал идёт в скриншоты. Перевод на русский — только для вас, на картинки не влияет. После правок нажмите «Перерисовать»." />
        {review.publishedAt ? (
          <span style={{ fontSize: "0.75rem", color: colors.muted }}>опубликован</span>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="admin-btn"
          disabled={Boolean(busy)}
          onClick={() => void runAction("translate")}
          style={{ opacity: busy ? 0.7 : 1 }}
        >
          {busy === "translate" ? "Перевод…" : "Перевести на RU"}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={Boolean(busy) || !dirty}
          onClick={() => void saveEdits()}
          style={{ opacity: busy || !dirty ? 0.7 : 1 }}
        >
          {busy === "save" ? "Сохранение…" : "Сохранить текст"}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={Boolean(busy)}
          onClick={() => void runAction("rerender")}
          style={{ opacity: busy ? 0.7 : 1 }}
        >
          {busy === "rerender" ? "Рендер…" : "Перерисовать скрины"}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={Boolean(busy) || Boolean(review.publishedAt)}
          onClick={() => void runAction("publish")}
          style={{ opacity: busy || review.publishedAt ? 0.7 : 1 }}
        >
          {busy === "publish" ? "Публикация…" : "Опубликовать"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.55rem",
          maxHeight: 420,
          overflow: "auto",
          padding: "0.5rem",
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          background: "#fafafa",
        }}
      >
        {review.dialog.messages.map((m) => {
          const isClient = m.role === "client";
          const mediaLabel = MEDIA_LABELS[m.type];
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isClient ? "flex-start" : "flex-end",
                maxWidth: "92%",
                background: isClient ? "#fff" : "#E7FCC4",
                borderRadius: 12,
                padding: "0.45rem 0.65rem",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  color: colors.muted,
                  marginBottom: 4,
                }}
              >
                {isClient ? "Клиент" : "Менеджер"}
                {mediaLabel ? ` · ${mediaLabel}` : ""}
              </div>
              {m.type === "text" ? (
                <>
                  <textarea
                    value={drafts[m.id] ?? m.content}
                    onChange={(e) => {
                      setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }));
                      setDirty(true);
                    }}
                    rows={Math.min(6, Math.max(2, (drafts[m.id] ?? m.content).split("\n").length + 1))}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      padding: "0.35rem 0.45rem",
                      fontSize: "0.875rem",
                      fontFamily: "inherit",
                      lineHeight: 1.35,
                      boxSizing: "border-box",
                    }}
                  />
                  {translations[m.id] ? (
                    <p
                      style={{
                        margin: "0.35rem 0 0",
                        fontSize: "0.8rem",
                        color: "#334",
                        background: "rgba(0,0,0,0.04)",
                        borderRadius: 6,
                        padding: "0.3rem 0.4rem",
                      }}
                    >
                      <span style={{ color: colors.muted }}>RU: </span>
                      {translations[m.id]}
                    </p>
                  ) : null}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem", color: colors.muted }}>
                  {mediaLabel ?? m.type}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
