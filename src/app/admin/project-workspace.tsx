"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { chatUiForLocale } from "@/lib/i18n/chat-ui";

import { AppleEmojiText } from "./ui/AppleEmojiText";
import { ScreenshotGallery } from "./screenshot-gallery";
import { colors, inputStyle } from "./styles";
import { HelpTip, LabelWithHelp } from "./ui/HelpTip";
import { MediaPicker, type PickerMediaAsset } from "./ui/MediaPicker";

export interface ProjectWorkspaceProps {
  project: {
    id: string;
    name: string;
    locale: string;
    currency: string;
    managerHandle: string;
    managerName: string;
    twoPhaseReview: boolean;
    wallpaperPath?: string | null;
    theme: {
      incomingBubble: string;
      outgoingBubble: string;
      accentColor: string;
    };
    depositMessageTemplate: string;
    payoutMessageTemplate: string;
  };
  initialReview?: {
    id: string;
    screenshots: string[];
  } | null;
}

function wallpaperPreviewUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/api/admin/media/file?path=${encodeURIComponent(path)}`;
}

type Tab = "preview" | "settings";

/** Frosted glass pill — blur lives on ::after (backdrop-filter), content stays sharp. */
function GlassPill({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`project-glass-pill ${className}`}>{children}</div>;
}

export function ProjectWorkspace({ project, initialReview }: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState(initialReview?.id ?? "");
  const [screenshots, setScreenshots] = useState<string[]>(initialReview?.screenshots ?? []);
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [wallpaperPath, setWallpaperPath] = useState<string | null>(project.wallpaperPath ?? null);
  const [useAiWallpaper, setUseAiWallpaper] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<PickerMediaAsset[]>([]);
  const [form, setForm] = useState({
    managerHandle: project.managerHandle,
    managerName: project.managerName,
    depositMessageTemplate: project.depositMessageTemplate,
    payoutMessageTemplate: project.payoutMessageTemplate,
    incomingBubble: project.theme.incomingBubble,
    outgoingBubble: project.theme.outgoingBubble,
    accentColor: project.theme.accentColor,
    twoPhaseReview: project.twoPhaseReview,
  });

  const loadLastReview = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reviews?projectId=${project.id}&limit=1`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        reviews?: Array<{ id: string; screenshots: string[] }>;
      };
      const last = data.reviews?.[0];
      if (last) {
        setReviewId(last.id);
        setScreenshots(last.screenshots);
      }
    } catch {
      // no prior review — ignore
    }
  }, [project.id]);

  const loadMediaAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media");
      const data = (await res.json()) as { assets?: PickerMediaAsset[] };
      setMediaAssets(data.assets ?? []);
    } catch {
      setMediaAssets([]);
    }
  }, []);

  useEffect(() => {
    setWallpaperPath(project.wallpaperPath ?? null);
  }, [project.id, project.wallpaperPath]);

  const wallpaperUrl = wallpaperPreviewUrl(wallpaperPath);

  useEffect(() => {
    if (!initialReview && screenshots.length === 0) {
      void loadLastReview();
    }
  }, [initialReview, screenshots.length, loadLastReview]);

  useEffect(() => {
    if (tab === "settings") void loadMediaAssets();
  }, [tab, loadMediaAssets]);

  const wallpaperLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return mediaAssets.filter((a) => {
      if (!a.isImage) return false;
      // Prefer wallpapers; also allow other photos from media storage.
      return (
        a.type === "wallpaper" ||
        a.type === "story_photo" ||
        a.type === "sticker" ||
        a.type === "avatar" ||
        a.path.includes("wallpapers")
      );
    });
  }, [mediaAssets]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          reviewType: "big",
          autoPublish: false,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reviewId?: string;
        screenshots?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка генерации");
      setReviewId(data.reviewId ?? "");
      setScreenshots(data.screenshots ?? []);
      setTab("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerHandle: form.managerHandle,
          managerName: form.managerName,
          depositMessageTemplate: form.depositMessageTemplate,
          payoutMessageTemplate: form.payoutMessageTemplate,
          twoPhaseReview: form.twoPhaseReview,
          theme: {
            incomingBubble: form.incomingBubble,
            outgoingBubble: form.outgoingBubble,
            accentColor: form.accentColor,
            headerBg: "#F7F7F7",
            statusBarStyle: "light",
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function uploadWallpaper(file: File) {
    setMediaBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("type", "wallpaper");
      fd.set("file", file);
      fd.set("projectId", project.id);
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; path?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки фона");
      if (data.path) setWallpaperPath(data.path);
      await loadMediaAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setMediaBusy(false);
    }
  }

  async function generateWallpaperAi() {
    setMediaBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "wallpaper", count: 1, projectId: project.id }),
      });
      const data = (await res.json()) as { error?: string; path?: string };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка генерации фона");
      if (data.path) setWallpaperPath(data.path);
      setUseAiWallpaper(false);
      await loadMediaAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setMediaBusy(false);
    }
  }

  async function selectWallpaperFromLibrary(asset: PickerMediaAsset) {
    setMediaBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallpaperPath: asset.path }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить фон");
      setWallpaperPath(asset.path);
      setPickerOpen(false);
      setUseAiWallpaper(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setMediaBusy(false);
    }
  }

  const fieldInput = inputStyle();
  const chatUi = useMemo(() => chatUiForLocale(project.locale), [project.locale]);
  const sampleIn = chatUi.sampleMessages.filter((m) => m.role === "client");
  const sampleOut = chatUi.sampleMessages.filter((m) => m.role === "manager");
  const wallpaperImage = wallpaperUrl
    ? `url("${wallpaperUrl}")`
    : "linear-gradient(180deg, #6ba3be, #4a8fa8)";

  return (
    <div style={projectCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            {project.name}
            <HelpTip text="Это менеджер (актриса) в чате. Отзывы публикуются от её имени." />
          </h2>
          <p style={{ color: colors.muted, margin: "0.25rem 0 0", fontSize: "0.82rem" }}>
            {project.managerHandle} · {project.locale} · {project.currency}
            {project.id === "nancy" ? " · двухчастные отзывы" : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <button type="button" onClick={handleGenerate} disabled={loading} className="admin-btn" style={{ opacity: loading ? 0.7 : 1 }}>
            {loading ? "Готовим…" : "Сделать пробный отзыв"}
          </button>
          <HelpTip text="Создаёт скриншоты переписки прямо здесь. В Telegram-канал ничего не отправит." />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.85rem", borderBottom: `1px solid ${colors.border}` }}>
        <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>
          Скриншоты
        </TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>
          Настройки
        </TabBtn>
      </div>

      {error && <p style={{ color: colors.danger, fontSize: "0.875rem", margin: "0.5rem 0 0" }}>{error}</p>}

      {tab === "preview" && (
        <div style={{ marginTop: "0.75rem" }}>
          {screenshots.length > 0 ? (
            <ScreenshotGallery screenshots={screenshots} reviewId={reviewId} />
          ) : (
            <p style={{ margin: 0, color: colors.muted, fontSize: "0.875rem" }}>
              Пока нет скриншотов. Нажмите «Сделать пробный отзыв».
            </p>
          )}
        </div>
      )}

      {tab === "settings" && (
        <form onSubmit={handleSaveSettings} className="project-settings-layout">
          <div className="project-settings-fields">
            <Field
              label={<LabelWithHelp label="Ник в Telegram" tip="Как отображается менеджер, например @Maya_Nancy." />}
            >
              <input style={fieldInput} value={form.managerHandle} onChange={(e) => setForm({ ...form, managerHandle: e.target.value })} />
            </Field>
            <Field label={<LabelWithHelp label="Имя в шапке чата" tip="Имя, которое видно вверху скриншота переписки." />}>
              <input style={fieldInput} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
            </Field>
            <Field
              label={
                <LabelWithHelp
                  label="Сообщение с реквизитами"
                  tip="Текст, где менеджер просит внести депозит. Подстановки: {{bankName}}, {{clabe}}, суммы."
                />
              }
            >
              <textarea
                style={{ ...fieldInput, minHeight: 72, resize: "vertical" }}
                value={form.depositMessageTemplate}
                onChange={(e) => setForm({ ...form, depositMessageTemplate: e.target.value })}
              />
            </Field>
            <Field label={<LabelWithHelp label="Сообщение о выплате" tip="Текст, когда менеджер сообщает, что деньги отправлены клиенту." />}>
              <textarea
                style={{ ...fieldInput, minHeight: 56, resize: "vertical" }}
                value={form.payoutMessageTemplate}
                onChange={(e) => setForm({ ...form, payoutMessageTemplate: e.target.value })}
              />
            </Field>

            <div className="ctor-upload">
              <div className="ctor-upload-meta">
                <strong>
                  Фон чата (обои)
                  <HelpTip text="Выберите картинку из медиатеки или загрузите новую. Сразу ставится для этого проекта." />
                </strong>
                <span>Сначала выберите из медиахранилища. Загрузка / ИИ — если нужен новый файл.</span>
              </div>
              <div className="ctor-upload-row">
                {wallpaperUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wallpaperUrl} alt="" className="ctor-upload-preview" />
                ) : (
                  <div className="ctor-upload-preview is-empty">нет</div>
                )}
                <div className="ctor-upload-actions">
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={mediaBusy}
                    onClick={() => {
                      setUseAiWallpaper(false);
                      setPickerOpen(true);
                    }}
                  >
                    Выбрать из медиатеки
                  </button>
                  <label className="ctor-ai-check">
                    <input
                      type="checkbox"
                      checked={useAiWallpaper}
                      disabled={mediaBusy}
                      onChange={(e) => setUseAiWallpaper(e.target.checked)}
                    />
                    Сгенерировать через ИИ
                  </label>
                  {useAiWallpaper ? (
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={mediaBusy}
                      onClick={() => void generateWallpaperAi()}
                    >
                      {mediaBusy ? "Генерация…" : "Сгенерировать"}
                    </button>
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      disabled={mediaBusy}
                      title="Загрузить новый файл в медиатеку"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadWallpaper(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem" }}>
              <Field label={<LabelWithHelp label="Пузырь клиента" tip="Цвет входящих сообщений (от клиента)." />}>
                <input type="color" style={{ ...fieldInput, height: 38, padding: 2 }} value={form.incomingBubble} onChange={(e) => setForm({ ...form, incomingBubble: e.target.value })} />
              </Field>
              <Field label={<LabelWithHelp label="Пузырь менеджера" tip="Цвет исходящих сообщений (от менеджера)." />}>
                <input type="color" style={{ ...fieldInput, height: 38, padding: 2 }} value={form.outgoingBubble} onChange={(e) => setForm({ ...form, outgoingBubble: e.target.value })} />
              </Field>
              <Field label={<LabelWithHelp label="Акцент" tip="Цвет деталей интерфейса чата (галочки, акценты)." />}>
                <input type="color" style={{ ...fieldInput, height: 38, padding: 2 }} value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
              </Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={form.twoPhaseReview}
                onChange={(e) => setForm({ ...form, twoPhaseReview: e.target.checked })}
                disabled={project.id !== "nancy"}
              />
              Двухчастная публикация
              <HelpTip text="Сначала 4 скрина, через ~1.5 часа — полный отзыв. По ТЗ включается только для Nancy." />
            </label>
            <button type="submit" className="admin-btn" style={{ alignSelf: "flex-start" }} disabled={saving || mediaBusy}>
              {saving ? "Сохранение…" : "Сохранить настройки"}
            </button>
          </div>

          <aside className="project-live-preview" aria-label="Превью чата">
            <div className="project-live-preview-head">
              <strong>Как будет выглядеть</strong>
              <span>Живой пример без генерации отзыва</span>
            </div>
            <div
              className="project-phone"
              style={{ ["--chat-wallpaper" as string]: wallpaperImage } as CSSProperties}
            >
              <div className="project-phone-stage">
                <div className="project-phone-wallpaper" aria-hidden />
                <div className="project-phone-chat">
                  <div className="project-phone-chat-spacer" aria-hidden />
                  <div className="project-phone-chat-messages">
                    <div className="project-phone-bubble is-in" style={{ background: form.incomingBubble }}>
                      <AppleEmojiText text={sampleIn[0]?.content ?? "Привет! Как это работает?"} />
                    </div>
                    <div className="project-phone-bubble is-out" style={{ background: form.outgoingBubble }}>
                      <AppleEmojiText
                        text={
                          previewSnippet(form.depositMessageTemplate) ||
                          sampleOut[0]?.content ||
                          "Сейчас всё расскажу"
                        }
                      />
                      <span className="project-phone-checks" style={{ color: form.accentColor }}>
                        ✓✓
                      </span>
                    </div>
                    <div className="project-phone-bubble is-in" style={{ background: form.incomingBubble }}>
                      <AppleEmojiText
                        text={sampleIn[2]?.content ?? sampleIn[1]?.content ?? "Готово, уже оплатил"}
                      />
                    </div>
                    <div className="project-phone-bubble is-out" style={{ background: form.outgoingBubble }}>
                      <AppleEmojiText
                        text={previewSnippet(form.payoutMessageTemplate) || "Деньги отправлены 💸"}
                      />
                      <span className="project-phone-checks" style={{ color: form.accentColor }}>
                        ✓✓
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="project-phone-header-frost" aria-hidden />

              <div className="project-phone-header">
                <div className="project-phone-status">
                  <span>9:41</span>
                  <span className="project-phone-tg-pill">TELEGRAM</span>
                  <span className="project-phone-status-icons" aria-hidden>
                    <svg width="14" height="9" viewBox="0 0 19.5 12" fill="currentColor">
                      <rect x="0" y="8.5" width="3.2" height="3.5" rx="0.7" />
                      <rect x="4.8" y="6" width="3.2" height="6" rx="0.7" />
                      <rect x="9.6" y="3.2" width="3.2" height="8.8" rx="0.7" />
                      <rect x="14.4" y="0.5" width="3.2" height="11.5" rx="0.7" opacity="0.35" />
                    </svg>
                    <svg width="12" height="9" viewBox="0 0 17 12" fill="none">
                      <circle cx="8.5" cy="10.4" r="1.15" fill="currentColor" />
                      <path d="M5.1 7.55C6.05 6.55 7.2 6 8.5 6C9.8 6 10.95 6.55 11.9 7.55" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
                      <path d="M2.55 5.05C4.2 3.25 6.2 2.3 8.5 2.3C10.8 2.3 12.8 3.25 14.45 5.05" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
                      <path d="M0.75 2.55C3 0.55 5.55 0 8.5 0C11.45 0 14 0.55 16.25 2.55" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
                    </svg>
                    <svg width="19" height="9" viewBox="0 0 27 13" fill="none">
                      <rect x="0.6" y="0.6" width="23" height="11.8" rx="2.6" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
                      <rect x="2.1" y="2.15" width="18.5" height="8.7" rx="1.5" fill="currentColor" />
                      <path d="M25.1 4.1C25.95 4.45 26.5 5.25 26.5 6.5C26.5 7.75 25.95 8.55 25.1 8.9V4.1Z" fill="currentColor" opacity="0.45" />
                    </svg>
                  </span>
                </div>
                <div className="project-phone-nav">
                  <GlassPill className="project-phone-back">
                    <svg className="project-phone-back-chevron" viewBox="0 0 12 20" fill="none" aria-hidden>
                      <path
                        d="M9.2 1.6L1.7 10l7.5 8.4"
                        stroke="#1C1C1E"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="project-phone-badge">1</span>
                  </GlassPill>
                  <GlassPill className="project-phone-title">
                    <strong>{chatUi.sampleClientName}</strong>
                    <em>{chatUi.statusRecently}</em>
                  </GlassPill>
                  <GlassPill className="project-phone-avatar">
                    <span>{chatUi.sampleClientName.slice(0, 1).toUpperCase()}</span>
                  </GlassPill>
                </div>
              </div>

              <div className="project-phone-input-frost" aria-hidden />

              <div className="project-phone-input">
                <GlassPill className="project-phone-attach">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18.2 9.35v7.05c0 2.65-2.15 4.8-4.8 4.8s-4.8-2.15-4.8-4.8V7.55c0-1.75 1.4-3.15 3.15-3.15s3.15 1.4 3.15 3.15v8a1.5 1.5 0 01-3 0V9.2"
                      stroke="#000"
                      strokeWidth="2.15"
                      strokeLinecap="round"
                    />
                  </svg>
                </GlassPill>
                <GlassPill className="project-phone-input-pill">
                  <span>{chatUi.inputPlaceholder}</span>
                  <span className="project-phone-sticker" aria-hidden>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="8.4" stroke="#636366" strokeWidth="1.85" />
                      <path d="M15.35 5.85C11.85 5.85 9.85 9.05 9.85 12.15C9.85 15.25 11.85 18.45 15.35 18.45" stroke="#636366" strokeWidth="1.85" strokeLinecap="round" />
                      <circle cx="9.7" cy="10.15" r="1.15" fill="#636366" />
                    </svg>
                  </span>
                </GlassPill>
                <GlassPill className="project-phone-mic">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2.8c-1.7 0-3.05 1.35-3.05 3.05v6.3c0 1.7 1.35 3.05 3.05 3.05s3.05-1.35 3.05-3.05v-6.3C15.05 4.15 13.7 2.8 12 2.8z"
                      stroke="#007AFF"
                      strokeWidth="2.1"
                    />
                    <path
                      d="M5.9 11.4c0 3.2 2.5 5.85 5.6 6.2v2.4h1v-2.4c3.1-.35 5.6-3 5.6-6.2"
                      stroke="#007AFF"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                    />
                  </svg>
                </GlassPill>
              </div>
            </div>
            <p className="project-live-preview-foot">
              {form.managerHandle || project.managerHandle} · фон и цвета обновляются сразу
            </p>
          </aside>
        </form>
      )}

      <MediaPicker
        open={pickerOpen}
        title="Фон чата из медиатеки"
        emptyHint="В медиатеке пока нет картинок. Загрузите фото в разделе «Медиатека» или файл ниже."
        footNote="Выбор сразу ставит фон для этого проекта. Новые файлы можно добавить в Медиатеке."
        assets={wallpaperLibraryAssets}
        selectedPath={wallpaperPath}
        disabled={mediaBusy}
        onClose={() => setPickerOpen(false)}
        onSelect={(asset) => void selectWallpaperFromLibrary(asset)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0.45rem 0.8rem",
        borderRadius: 0,
        border: "none",
        borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
        cursor: "pointer",
        fontSize: "0.875rem",
        fontWeight: active ? 700 : 500,
        background: "transparent",
        color: active ? colors.text : colors.muted,
        marginBottom: -1,
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      {label}
      {children}
    </label>
  );
}

/** Short sample text for live phone preview (no full generation). */
function previewSnippet(text: string, max = 90): string {
  const cleaned = text.replace(/\{\{[^}]+\}\}/g, "••••").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

const projectCardStyle: CSSProperties = {
  background: "var(--panel)",
  borderRadius: 2,
  padding: "1rem 1.05rem",
  border: "1px solid var(--line-strong)",
  marginBottom: "0.85rem",
};
