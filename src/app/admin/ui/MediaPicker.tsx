"use client";

import { useEffect, useMemo, useState } from "react";

import { colors } from "../styles";

export interface PickerMediaAsset {
  id: string;
  type: string;
  filename: string;
  path: string;
  projectId: string | null;
  url: string;
  isImage: boolean;
  isVideo: boolean;
}

type MediaPickerProps = {
  open: boolean;
  title: string;
  emptyHint: string;
  footNote?: string;
  assets: PickerMediaAsset[];
  selectedPath?: string | null;
  /** Allow picking videos (кружки). Default: images only. */
  allowVideo?: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (asset: PickerMediaAsset) => void;
};

export function MediaPicker({
  open,
  title,
  emptyHint,
  footNote = "Файлы из раздела «Медиатека».",
  assets,
  selectedPath,
  allowVideo = false,
  disabled,
  onClose,
  onSelect,
}: MediaPickerProps) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter(
      (a) =>
        a.filename.toLowerCase().includes(needle) ||
        a.type.toLowerCase().includes(needle) ||
        (a.projectId ?? "").toLowerCase().includes(needle),
    );
  }, [assets, q]);

  if (!open) return null;

  return (
    <div className="media-picker-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="media-picker-panel">
        <div className="media-picker-head">
          <div>
            <strong>{title}</strong>
            <span>{filtered.length} из медиатеки</span>
          </div>
          <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={disabled}>
            Закрыть
          </button>
        </div>

        <input
          className="media-picker-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени файла…"
          disabled={disabled}
        />

        {filtered.length === 0 ? (
          <p className="media-picker-empty">{emptyHint}</p>
        ) : (
          <div className="media-picker-grid">
            {filtered.map((a) => {
              const active = selectedPath === a.path;
              const canPick = a.isImage || (allowVideo && a.isVideo);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`media-picker-item${active ? " is-active" : ""}`}
                  disabled={disabled || !canPick}
                  onClick={() => onSelect(a)}
                  title={a.filename}
                >
                  {a.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" />
                  ) : (
                    <span className="media-picker-video">видео</span>
                  )}
                  <em>
                    {a.type === "story_photo"
                      ? "Общие"
                      : a.type === "avatar"
                        ? "Аватар"
                        : a.type === "conditions"
                          ? "Условия"
                          : a.type === "bet"
                            ? "Ставка"
                            : a.type === "video_note"
                              ? "Кружок"
                              : a.type === "wallpaper" || a.path.includes("wallpapers")
                                ? "Обои"
                                : a.type === "sticker"
                                  ? "Стикер"
                                  : a.type}
                  </em>
                </button>
              );
            })}
          </div>
        )}

        <p className="media-picker-foot" style={{ color: colors.muted }}>
          {footNote}
        </p>
      </div>
    </div>
  );
}
