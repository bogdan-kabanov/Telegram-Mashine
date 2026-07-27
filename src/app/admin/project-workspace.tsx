"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import { chatUiForLocale } from "@/lib/i18n/chat-ui";

import { AppleEmojiText } from "./ui/AppleEmojiText";
import { ScreenshotGallery } from "./screenshot-gallery";
import { colors, inputStyle } from "./styles";
import { HelpTip, LabelWithHelp } from "./ui/HelpTip";
import { MediaPicker, type PickerMediaAsset } from "./ui/MediaPicker";
import { ZoomPhotoLightbox } from "./ui/ZoomPhotoLightbox";

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
  locales: Array<{
    code: string;
    name: string;
    currency: string;
    bankCountry: string;
  }>;
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

/**
 * Frosted glass via clipped blurred wallpaper (not backdrop-filter — flat in many
 * Chromium/screenshot paths). Positions frost layer to phone origin.
 */
function GlassPill({
  className,
  phoneRef,
  children,
}: {
  className: string;
  phoneRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frostRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const sync = () => {
      const phone = phoneRef.current;
      const host = hostRef.current;
      const frost = frostRef.current;
      if (!phone || !host || !frost) return;
      const pr = phone.getBoundingClientRect();
      const r = host.getBoundingClientRect();
      frost.style.setProperty("--frost-left", `${pr.left - r.left}px`);
      frost.style.setProperty("--frost-top", `${pr.top - r.top}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [phoneRef]);

  return (
    <div ref={hostRef} className={`project-glass-pill ${className}`}>
      <span ref={frostRef} className="project-glass-frost" aria-hidden />
      <span className="project-glass-tint" aria-hidden />
      <span className="project-glass-content">{children}</span>
    </div>
  );
}

export function ProjectWorkspace({ project, locales, initialReview }: ProjectWorkspaceProps) {
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    locale: project.locale,
    managerHandle: project.managerHandle,
    managerName: project.managerName,
    depositMessageTemplate: project.depositMessageTemplate,
    payoutMessageTemplate: project.payoutMessageTemplate,
    incomingBubble: project.theme.incomingBubble,
    outgoingBubble: project.theme.outgoingBubble,
    accentColor: project.theme.accentColor,
    twoPhaseReview: project.twoPhaseReview,
  });

  const selectedLocale = useMemo(
    () => locales.find((l) => l.code === form.locale) ?? locales[0],
    [locales, form.locale],
  );
  const displayCurrency = selectedLocale?.currency ?? project.currency;

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
          locale: form.locale,
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

  /** Full-size Playwright PNG (390×844 @3x) — for zoom compare with real Telegram. */
  async function openAsPhoto() {
    setPhotoBusy(true);
    setError(null);
    try {
      // Persist current settings so the renderer matches the live form.
      const saveRes = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: form.locale,
          managerHandle: form.managerHandle,
          managerName: form.managerName,
          depositMessageTemplate: form.depositMessageTemplate,
          payoutMessageTemplate: form.payoutMessageTemplate,
          twoPhaseReview: form.twoPhaseReview,
          wallpaperPath,
          theme: {
            incomingBubble: form.incomingBubble,
            outgoingBubble: form.outgoingBubble,
            accentColor: form.accentColor,
            headerBg: "#F7F7F7",
            statusBarStyle: "light",
          },
        }),
      });
      if (!saveRes.ok) {
        const data = (await saveRes.json()) as { error?: string };
        throw new Error(data.error ?? "Не удалось сохранить перед рендером");
      }

      const res = await fetch("/api/renderer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = (await res.json()) as { error?: string; pngUrl?: string };
      if (!res.ok || !data.pngUrl) throw new Error(data.error ?? "Ошибка рендера превью");
      setPhotoUrl(`${data.pngUrl}?t=${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPhotoBusy(false);
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
  const chatUi = useMemo(() => chatUiForLocale(form.locale), [form.locale]);
  const sampleIn = chatUi.sampleMessages.filter((m) => m.role === "client");
  const sampleOut = chatUi.sampleMessages.filter((m) => m.role === "manager");
  const phoneRef = useRef<HTMLDivElement>(null);
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
            {form.managerHandle} · {form.locale} · {displayCurrency}
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
              label={
                <LabelWithHelp
                  label="Язык / регион"
                  tip="Меняет рынок проекта: валюту, пул имён клиентов, банки и формат сумм. Тексты отзывов не переводятся автоматически — их правьте отдельно."
                />
              }
            >
              <select
                style={fieldInput}
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
              >
                {locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.currency})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={
                <LabelWithHelp
                  label="Валюта"
                  tip="Подставляется автоматически из языка/региона (config/geo.json)."
                />
              }
            >
              <input style={{ ...fieldInput, opacity: 0.85 }} value={displayCurrency} readOnly />
            </Field>
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
              ref={phoneRef}
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
                <div className="project-phone-header-frost" aria-hidden />

                {/* Inside stage so backdrop-filter samples wallpaper */}
                <div className="project-phone-input">
                  <GlassPill className="project-phone-attach" phoneRef={phoneRef}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                        stroke="#1C1C1E"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </GlassPill>
                  <GlassPill className="project-phone-input-pill" phoneRef={phoneRef}>
                    <span>{chatUi.inputPlaceholder}</span>
                    <span className="project-phone-sticker" aria-hidden>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M19.4 16.28A8.55 8.55 0 1 1 12 3.45"
                          stroke="#636366"
                          strokeWidth="1.55"
                          strokeLinecap="round"
                        />
                        <path
                          d="M12 3.45C15.5 4.5 18.5 9 19.4 16.28"
                          stroke="#636366"
                          strokeWidth="1.55"
                          strokeLinecap="round"
                        />
                        <path
                          d="M12 3.45C10.5 8 14 14 19.4 16.28"
                          stroke="#636366"
                          strokeWidth="1.55"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </GlassPill>
                  <GlassPill className="project-phone-mic" phoneRef={phoneRef}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2.8c-1.7 0-3.05 1.35-3.05 3.05v6.3c0 1.7 1.35 3.05 3.05 3.05s3.05-1.35 3.05-3.05v-6.3C15.05 4.15 13.7 2.8 12 2.8z"
                        stroke="#1C1C1E"
                        strokeWidth="1.45"
                      />
                      <path
                        d="M5.9 11.4c0 3.2 2.5 5.85 5.6 6.2v2.4h1v-2.4c3.1-.35 5.6-3 5.6-6.2"
                        stroke="#1C1C1E"
                        strokeWidth="1.45"
                        strokeLinecap="round"
                      />
                    </svg>
                  </GlassPill>
                </div>
              </div>

              <div className="project-phone-header">
                <div className="project-phone-status">
                  <span>9:41</span>
                  <span className="project-phone-tg-pill">
                    <svg viewBox="48 68 130 115" aria-hidden>
                      <path
                        fill="#fff"
                        d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043a8.13 8.13 0 0 1-4.925-1.542c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-1.38.79Z"
                      />
                      <path
                        fill="rgba(255,255,255,0.45)"
                        d="M81.229 128.772 95.466 168.178s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6Z"
                      />
                    </svg>
                    TELEGRAM
                  </span>
                  <span className="project-phone-status-icons" aria-hidden>
                    <svg width="14" height="9" viewBox="0 0 19.5 12" fill="currentColor">
                      <rect x="0" y="8.5" width="3.2" height="3.5" rx="0.7" />
                      <rect x="4.8" y="6" width="3.2" height="6" rx="0.7" />
                      <rect x="9.6" y="3.2" width="3.2" height="8.8" rx="0.7" />
                      <rect x="14.4" y="0.5" width="3.2" height="11.5" rx="0.7" opacity="0.35" />
                    </svg>
                    <svg width="12" height="9" viewBox="0 0 16 12" fill="none">
                      <circle cx="8" cy="10.55" r="1.05" fill="currentColor" />
                      <path d="M5.4 7.85c.8-.85 1.85-1.35 2.95-1.35s2.15.5 2.95 1.35" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
                      <path d="M3.55 5.55c1.3-1.4 2.95-2.2 4.7-2.2s3.4.8 4.7 2.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
                      <path d="M1.85 3.35c1.75-1.75 3.85-2.6 6.4-2.6s4.65.85 6.4 2.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
                    </svg>
                    <svg width="19" height="9" viewBox="0 0 27 13" fill="none">
                      <rect x="0.6" y="0.6" width="23" height="11.8" rx="2.6" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
                      <rect x="2.1" y="2.15" width="18.5" height="8.7" rx="1.5" fill="currentColor" />
                      <path d="M25.1 4.1C25.95 4.45 26.5 5.25 26.5 6.5C26.5 7.75 25.95 8.55 25.1 8.9V4.1Z" fill="currentColor" opacity="0.45" />
                    </svg>
                  </span>
                </div>
                <div className="project-phone-nav">
                  <GlassPill className="project-phone-back" phoneRef={phoneRef}>
                    <svg className="project-phone-back-chevron" viewBox="0 0 12 20" fill="none" aria-hidden>
                      <path
                        d="M9.2 1.6L1.7 10l7.5 8.4"
                        stroke="#000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="project-phone-badge">1</span>
                  </GlassPill>
                  <GlassPill className="project-phone-title" phoneRef={phoneRef}>
                    <strong>{chatUi.sampleClientName}</strong>
                    <em>{chatUi.statusRecently}</em>
                  </GlassPill>
                  <GlassPill className="project-phone-avatar" phoneRef={phoneRef}>
                    <span>{chatUi.sampleClientName.slice(0, 1).toUpperCase()}</span>
                  </GlassPill>
                </div>
              </div>
            </div>
            <div className="project-live-preview-actions">
              <button
                type="button"
                className="project-photo-btn"
                disabled={photoBusy}
                onClick={() => void openAsPhoto()}
              >
                {photoBusy ? "Рендер…" : "Открыть как фото"}
              </button>
              <p className="project-live-preview-foot">
                Реальный PNG 390×844 @3x (1170×2532) — зумить и сравнить с оригиналом
              </p>
            </div>
            <p className="project-live-preview-foot">
              {form.managerHandle || project.managerHandle} · фон и цвета обновляются сразу
            </p>
          </aside>
        </form>
      )}

      {photoUrl ? (
        <ZoomPhotoLightbox
          src={photoUrl}
          title="Превью чата (полный размер)"
          onClose={() => setPhotoUrl(null)}
        />
      ) : null}

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
