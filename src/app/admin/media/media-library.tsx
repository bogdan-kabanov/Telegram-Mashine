"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MEDIA_TYPE_HINTS, MEDIA_TYPE_LABELS, UPLOAD_MEDIA_TYPES } from "@/lib/media/types";

import { colors, inputStyle, radius } from "../styles";
import { HelpTip, LabelWithHelp } from "../ui/HelpTip";

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

const FRIENDLY_LABELS: Record<string, string> = {
  story_photo: "Фото клиента в чате",
  sticker: "Стикер приветствия",
  bet: "Картинка ставки",
  conditions: "Условия (GIF/картинка)",
  video_note: "Кружок (видео)",
  avatar: "Аватар",
};

/** Types that must belong to one project (no cross-mixing). Wallpaper is set in Проекты → Настройки. */
const PROJECT_REQUIRED = new Set(["bet", "conditions", "video_note", "avatar"]);
/** Shared across projects. */
const SHARED_TYPES = new Set(["story_photo", "sticker"]);

/** Upload/AI types available in media library (no wallpaper assignment). */
const LIBRARY_UPLOAD_TYPES = UPLOAD_MEDIA_TYPES.filter((t) => t !== "wallpaper");
const LIBRARY_GEN_KINDS = ["story_photo", "bet", "conditions", "avatar", "sticker"] as const;

const SHARED_TAB = "__shared__";

export function MediaLibrary({ projects, legends }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectTab, setProjectTab] = useState<string>(projects[0]?.id ?? SHARED_TAB);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [genCount, setGenCount] = useState(1);
  const [genName, setGenName] = useState("");
  const [mediaType, setMediaType] = useState<(typeof LIBRARY_UPLOAD_TYPES)[number]>(
    LIBRARY_UPLOAD_TYPES[0] ?? "story_photo",
  );
  const [uploadProjectId, setUploadProjectId] = useState(projects[0]?.id ?? "");
  const [uploadLegendId, setUploadLegendId] = useState("standalone");
  const [preview, setPreview] = useState<Asset | null>(null);
  const [useAiUpload, setUseAiUpload] = useState(false);
  const [genKind, setGenKind] = useState<string>("story_photo");

  const field = inputStyle();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media");
      const data = (await res.json()) as { assets?: Asset[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAssets(data.assets ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось загрузить медиатеку");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (PROJECT_REQUIRED.has(mediaType) && !uploadProjectId && projects[0]) {
      setUploadProjectId(projects[0].id);
    }
  }, [mediaType, uploadProjectId, projects]);

  const scopedAssets = useMemo(() => {
    // Wallpaper is configured in Проекты → Настройки, not picked here.
    const withoutWallpaper = assets.filter((a) => a.type !== "wallpaper");
    if (projectTab === SHARED_TAB) {
      return withoutWallpaper.filter((a) => SHARED_TYPES.has(a.type) || !a.projectId);
    }
    return withoutWallpaper.filter((a) => a.projectId === projectTab);
  }, [assets, projectTab]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: scopedAssets.length };
    for (const a of scopedAssets) map[a.type] = (map[a.type] ?? 0) + 1;
    return map;
  }, [scopedAssets]);

  const projectCounts = useMemo(() => {
    const map: Record<string, number> = { [SHARED_TAB]: 0 };
    for (const p of projects) map[p.id] = 0;
    for (const a of assets) {
      if (a.type === "wallpaper") continue;
      if (SHARED_TYPES.has(a.type) || !a.projectId) {
        map[SHARED_TAB] = (map[SHARED_TAB] ?? 0) + 1;
      } else if (map[a.projectId] !== undefined) {
        map[a.projectId] = (map[a.projectId] ?? 0) + 1;
      }
    }
    return map;
  }, [assets, projects]);

  const visible = filter === "all" ? scopedAssets : scopedAssets.filter((a) => a.type === filter);

  const needsProject = PROJECT_REQUIRED.has(mediaType);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setMessage("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    if (needsProject && uploadProjectId) {
      formData.set("projectId", uploadProjectId);
    }
    try {
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: formData });
      const data = (await res.json()) as { error?: string; message?: string; projectId?: string | null };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setMessage(data.message ?? "Файл загружен");
      form.reset();
      setMediaType(LIBRARY_UPLOAD_TYPES[0] ?? "story_photo");
      if (data.projectId) setProjectTab(data.projectId);
      else if (SHARED_TYPES.has(mediaType)) setProjectTab(SHARED_TAB);
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

  async function handleGenerateAi(kindOverride?: string, countOverride?: number) {
    const kind = kindOverride ?? genKind;
    if (kind === "video_note") {
      setMessage("Кружки (MP4) ИИ не генерирует — загрузите файл.");
      return;
    }
    if (PROJECT_REQUIRED.has(kind) && !uploadProjectId) {
      setMessage("Выберите проект для генерации.");
      return;
    }
    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          count: countOverride ?? genCount,
          ...(uploadProjectId ? { projectId: uploadProjectId } : {}),
          ...(genName.trim() ? { clientName: genName.trim() } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка генерации");
      setMessage(data.message ?? data.error ?? "Готово");
      if (SHARED_TYPES.has(kind)) {
        setProjectTab(SHARED_TAB);
        setFilter(kind);
      } else if (uploadProjectId) {
        setProjectTab(uploadProjectId);
        setFilter(kind);
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
    }
  }

  const tabsForView =
    projectTab === SHARED_TAB
      ? ["all", "story_photo", "sticker"]
      : ["all", "bet", "conditions", "video_note", "avatar"];

  const labelOf = (t: string) => FRIENDLY_LABELS[t] ?? MEDIA_TYPE_LABELS[t] ?? t;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <section className="admin-card" data-tour="tour-media-upload">
        <h2 className="admin-card-title">
          Загрузить файл
          <HelpTip text="Ставки, условия, кружки и аватар — по проекту. Фото клиентов и стикеры — в общий пул. Фон чата задаётся в Проекты → Настройки." />
        </h2>
        <p className="admin-card-desc">{MEDIA_TYPE_HINTS[mediaType] ?? "Выберите тип файла."}</p>
        <form
          onSubmit={handleUpload}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "0.7rem",
            alignItems: "end",
          }}
        >
          <label className="admin-field">
            <LabelWithHelp
              label="Тип файла"
              tip="От типа зависит, куда бот положит файл и когда покажет его в отзыве."
              placement="below"
            />
            <select
              name="type"
              required
              style={field}
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as typeof mediaType)}
            >
              {LIBRARY_UPLOAD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labelOf(t)}
                </option>
              ))}
            </select>
          </label>

          {needsProject && (
            <label className="admin-field">
              <LabelWithHelp
                label="Проект"
                tip="Файл будет доступен только этому менеджеру — контент между проектами не смешивается."
                placement="below"
              />
              <select
                name="projectId"
                required
                style={field}
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mediaType === "video_note" ? (
            <label className="admin-field">
              <LabelWithHelp
                label="История (легенда)"
                tip="Кружок должен совпадать с текстом отзыва: кредиты / болезнь / и т.д. Standalone — для недельных кружков без привязки к истории."
                placement="below"
              />
              <select
                name="legendId"
                style={field}
                value={uploadLegendId}
                onChange={(e) => setUploadLegendId(e.target.value)}
              >
                <option value="standalone">Standalone (недельные / без истории)</option>
                {legends.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="admin-field">
            <LabelWithHelp label="Файл с компьютера" tip="Картинки (JPG/PNG) или видео кружка (MP4)." placement="below" />
            <input
              name="file"
              type="file"
              accept="image/*,.gif,.jpg,.jpeg,.png,.webp,image/gif,video/mp4,video/quicktime"
              required={!useAiUpload}
              disabled={useAiUpload}
              style={field}
            />
          </label>

          {mediaType !== "video_note" ? (
            <label className="admin-field" style={{ alignSelf: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.875rem" }}>
                <input
                  type="checkbox"
                  checked={useAiUpload}
                  onChange={(e) => setUseAiUpload(e.target.checked)}
                />
                Сгенерировать через ИИ (вместо файла)
              </span>
            </label>
          ) : null}

          {useAiUpload && mediaType !== "video_note" ? (
            <button
              type="button"
              className="admin-btn"
              style={{ height: 42 }}
              disabled={generating || uploading}
              onClick={() => void handleGenerateAi(mediaType, mediaType === "bet" ? 3 : 1)}
            >
              {generating ? "Генерация…" : "Сгенерировать ИИ"}
            </button>
          ) : (
            <button type="submit" className="admin-btn" style={{ height: 42 }} disabled={uploading || useAiUpload}>
              {uploading ? "Загрузка…" : "Загрузить"}
            </button>
          )}
        </form>
        {message && (
          <p style={{ margin: "0.7rem 0 0", fontSize: "0.875rem", color: colors.muted }}>{message}</p>
        )}
      </section>

      <section className="admin-card" data-tour="tour-media-ai-photo">
        <h2 className="admin-card-title">
          Генерация через ИИ
          <HelpTip text="Нужен OPENAI_API_KEY. Фото клиента — в общий пул; ставки/условия/аватар — в выбранный проект. Фон чата — в Проекты → Настройки." />
        </h2>
        <p className="admin-card-desc">
          Альтернатива загрузке файла. Кружки (MP4) ИИ не создаёт. Чеки генерируются сами при отзыве.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "0.7rem",
            alignItems: "end",
          }}
        >
          <label className="admin-field">
            <LabelWithHelp label="Что генерировать" tip="Тип файла для OpenAI Images." placement="below" />
            <select style={field} value={genKind} onChange={(e) => setGenKind(e.target.value)}>
              {LIBRARY_GEN_KINDS.map((k) => (
                <option key={k} value={k}>
                  {labelOf(k)}
                </option>
              ))}
            </select>
          </label>
          {PROJECT_REQUIRED.has(genKind) && (
            <label className="admin-field">
              <LabelWithHelp label="Проект" tip="Куда положить сгенерированный файл." placement="below" />
              <select style={field} value={uploadProjectId} onChange={(e) => setUploadProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-field">
            <LabelWithHelp label="Сколько штук" tip="За один раз максимум 5 — генерация платная." placement="below" />
            <select style={field} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <LabelWithHelp
              label="Имя (для фото/аватара)"
              tip="По имени бот угадывает пол для промпта."
              placement="below"
            />
            <input
              style={field}
              value={genName}
              onChange={(e) => setGenName(e.target.value)}
              placeholder="Diego López"
            />
          </label>
          <button
            type="button"
            className="admin-btn"
            style={{ height: 42 }}
            disabled={generating || uploading}
            onClick={() => void handleGenerateAi()}
          >
            {generating ? "Генерация…" : "Сгенерировать"}
          </button>
        </div>
      </section>

      <section className="admin-card" data-tour="tour-media-library">
        <h2 className="admin-card-title">
          Медиатека по проектам
          <HelpTip text="Сначала выберите проект — увидите только его ставки, условия и кружки. «Общие» — фото клиентов и стикеры. Фон чата настраивается в Проекты." />
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
          {projects.map((p) => {
            const active = projectTab === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProjectTab(p.id);
                  setFilter("all");
                  setUploadProjectId(p.id);
                }}
                style={{
                  border: `1px solid ${active ? colors.accent : colors.border}`,
                  background: active ? colors.accent : colors.card,
                  color: active ? "#fff" : colors.text,
                  borderRadius: 999,
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {p.name}
                <span style={{ opacity: 0.75, marginLeft: 6, fontWeight: 600 }}>{projectCounts[p.id] ?? 0}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setProjectTab(SHARED_TAB);
              setFilter("all");
            }}
            style={{
              border: `1px solid ${projectTab === SHARED_TAB ? colors.accent : colors.border}`,
              background: projectTab === SHARED_TAB ? colors.accent : colors.card,
              color: projectTab === SHARED_TAB ? "#fff" : colors.text,
              borderRadius: 999,
              padding: "0.4rem 0.75rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Общие
            <span style={{ opacity: 0.75, marginLeft: 6, fontWeight: 600 }}>{projectCounts[SHARED_TAB] ?? 0}</span>
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.85rem" }}>
          {tabsForView.map((t) => {
            const active = filter === t;
            const count = counts[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                style={{
                  border: `1px solid ${active ? colors.accent : colors.border}`,
                  background: active ? "#e8f4fc" : colors.card,
                  color: colors.text,
                  borderRadius: 999,
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t === "all" ? "Все типы" : labelOf(t)}
                <span style={{ color: colors.muted, marginLeft: 6 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>Загрузка…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>
            {projectTab === SHARED_TAB
              ? "В общем пуле пока пусто. Загрузите фото клиента или стикер."
              : `У проекта «${projects.find((p) => p.id === projectTab)?.name ?? projectTab}» пока нет файлов. Загрузите ставки, условия или кружки выше.`}
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
                  background: "#fff",
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
                    background: "#ebe6df",
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
                  <div style={{ fontSize: "0.75rem", color: colors.text, fontWeight: 650, lineHeight: 1.3 }}>
                    {labelOf(a.type)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: colors.muted,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.filename}
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
                      fontFamily: "inherit",
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {preview && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,31,28,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: colors.card,
              borderRadius: radius.md,
              maxWidth: 640,
              width: "100%",
              padding: "0.9rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.65rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{labelOf(preview.type)}</div>
                <div style={{ fontSize: "0.8rem", color: colors.muted }}>{preview.filename}</div>
              </div>
              <button type="button" className="admin-btn-secondary" onClick={() => setPreview(null)}>
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
