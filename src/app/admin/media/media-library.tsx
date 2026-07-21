"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MEDIA_TYPE_HINTS, MEDIA_TYPE_LABELS, UPLOAD_MEDIA_TYPES } from "@/lib/media/types";

import { colors, inputStyle, radius, styles } from "../styles";

interface Asset {
  id: string;
  type: string;
  label: string;
  filename: string;
  path: string;
  projectId: string | null;
  legendId: string | null;
  createdAt: string;
  url: string;
  isImage: boolean;
  isVideo: boolean;
}

interface Props {
  projects: Array<{ id: string; name: string }>;
  legends: Array<{ id: string; title: string }>;
}

export function MediaLibrary({ projects, legends }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [mediaType, setMediaType] = useState(UPLOAD_MEDIA_TYPES[0] ?? "story_photo");
  const [preview, setPreview] = useState<Asset | null>(null);

  const field = inputStyle();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/media");
    const data = (await res.json()) as { assets?: Asset[] };
    setAssets(data.assets ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: assets.length };
    for (const a of assets) map[a.type] = (map[a.type] ?? 0) + 1;
    return map;
  }, [assets]);

  const visible = filter === "all" ? assets : assets.filter((a) => a.type === filter);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setMessage("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: formData });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setMessage(data.message ?? "Загружено");
      form.reset();
      setMediaType(UPLOAD_MEDIA_TYPES[0] ?? "story_photo");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setUploading(false);
    }
  }

  async function remove(asset: Asset) {
    if (!confirm(`Удалить «${asset.filename}»?`)) return;
    const res = await fetch(`/api/admin/media?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setMessage(data.error ?? "Не удалось удалить");
      return;
    }
    if (preview?.id === asset.id) setPreview(null);
    await load();
  }

  const needsLegend = mediaType === "story_photo";
  const needsProject =
    mediaType === "wallpaper" || ["bet", "conditions", "avatar", "video_note"].includes(mediaType);

  const tabs = ["all", ...UPLOAD_MEDIA_TYPES];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Загрузить</h2>
        <p style={{ margin: "0 0 0.75rem", color: colors.muted, fontSize: "0.8125rem", lineHeight: 1.45 }}>
          {MEDIA_TYPE_HINTS[mediaType] ?? "Выберите тип файла."}
        </p>
        <form
          onSubmit={handleUpload}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.65rem", alignItems: "end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "0.75rem", color: colors.muted }}>Тип</span>
            <select name="type" required style={field} value={mediaType} onChange={(e) => setMediaType(e.target.value as typeof mediaType)}>
              {UPLOAD_MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEDIA_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </label>

          {needsLegend && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "0.75rem", color: colors.muted }}>Легенда</span>
              <select name="legendId" required style={field} defaultValue="">
                <option value="">Выберите…</option>
                {legends.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {needsProject && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "0.75rem", color: colors.muted }}>
                {mediaType === "wallpaper" ? "Проект" : "Проект (необяз.)"}
              </span>
              <select name="projectId" required={mediaType === "wallpaper"} style={field} defaultValue="">
                <option value="">{mediaType === "wallpaper" ? "Выберите…" : "Все проекты"}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "0.75rem", color: colors.muted }}>Файл</span>
            <input name="file" type="file" accept="image/*,video/mp4,video/quicktime" required style={field} />
          </label>

          <button type="submit" style={{ ...styles.button, height: 38 }} disabled={uploading}>
            {uploading ? "Загрузка…" : "Загрузить"}
          </button>
        </form>
        {message && (
          <p style={{ margin: "0.65rem 0 0", fontSize: "0.875rem", color: colors.muted }}>{message}</p>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.85rem" }}>
          {tabs.map((t) => {
            const active = filter === t;
            const count = counts[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                style={{
                  border: `1px solid ${active ? colors.accent : colors.border}`,
                  background: active ? colors.bg : colors.card,
                  color: colors.text,
                  borderRadius: radius.sm,
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                {t === "all" ? "Все" : MEDIA_TYPE_LABELS[t] ?? t}
                <span style={{ color: colors.muted, marginLeft: 6 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>Загрузка…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>
            Пока пусто. Загрузите файлы выше — для легенд используйте тип «Фото в диалоге».
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {visible.map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                  overflow: "hidden",
                  background: colors.bg,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  style={{
                    display: "block",
                    width: "100%",
                    height: 120,
                    padding: 0,
                    border: "none",
                    background: "#e8e8ea",
                    cursor: "pointer",
                  }}
                >
                  {a.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : a.isVideo ? (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", color: colors.muted, fontSize: "0.8rem" }}>
                      Видео
                    </div>
                  ) : (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", color: colors.muted, fontSize: "0.8rem" }}>
                      Файл
                    </div>
                  )}
                </button>
                <div style={{ padding: "0.45rem 0.55rem" }}>
                  <div style={{ fontSize: "0.75rem", color: colors.text, fontWeight: 500, lineHeight: 1.3 }}>
                    {MEDIA_TYPE_LABELS[a.type] ?? a.type}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.legendId ? `легенда: ${a.legendId}` : a.projectId ? `проект: ${a.projectId}` : a.filename}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    style={{
                      marginTop: 6,
                      border: "none",
                      background: "transparent",
                      color: colors.danger,
                      fontSize: "0.75rem",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{ background: colors.card, borderRadius: radius.md, maxWidth: 640, width: "100%", padding: "0.85rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.65rem" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{MEDIA_TYPE_LABELS[preview.type] ?? preview.type}</div>
                <div style={{ fontSize: "0.8rem", color: colors.muted }}>{preview.filename}</div>
              </div>
              <button type="button" style={styles.buttonSecondary} onClick={() => setPreview(null)}>
                Закрыть
              </button>
            </div>
            {preview.isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.filename} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }} />
            ) : preview.isVideo ? (
              <video src={preview.url} controls style={{ width: "100%", maxHeight: "70vh" }} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
