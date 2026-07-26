"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ControlButtons } from "../control-buttons";
import { ScreenshotGallery } from "../screenshot-gallery";
import { colors, inputStyle } from "../styles";
import { AppleEmojiText } from "../ui/AppleEmojiText";
import { HelpTip, LabelWithHelp } from "../ui/HelpTip";
import { MediaPicker, type PickerMediaAsset } from "../ui/MediaPicker";

export interface ConstructorProject {
  id: string;
  name: string;
  locale: string;
  currency: string;
  managerHandle: string;
  managerName: string;
  twoPhaseReview: boolean;
  phaseDelayMinutes: number;
  wallpaperPath: string | null;
  conditionsImagePath: string | null;
  conditionsTexts?: string[];
  managerAvatarPath: string | null;
  clientAvatarPath: string | null;
  theme: {
    incomingBubble: string;
    outgoingBubble: string;
    accentColor: string;
  };
  depositMessageTemplate: string;
  completionMessageTemplate: string;
  payoutMessageTemplate: string;
}

interface MediaAsset {
  id: string;
  type: string;
  filename: string;
  path: string;
  projectId: string | null;
  url: string;
  isImage: boolean;
  isVideo: boolean;
}

type StepId = "project" | "profile" | "look" | "conditions" | "texts" | "media" | "preview" | "launch";

/** Steps mirror TZ §2 (product story) + README assets checklist. */
const STEPS: Array<{
  id: StepId;
  title: string;
  short: string;
  doc: string;
}> = [
  {
    id: "project",
    title: "Проект",
    short: "Менеджер",
    doc: "ТЗ §2: актриса / менеджер, от имени которой идёт переписка.",
  },
  {
    id: "profile",
    title: "Профиль",
    short: "Имя и аватар",
    doc: "Шапка чата: имя и ник менеджера, как на реальном аккаунте.",
  },
  {
    id: "look",
    title: "Вид чата",
    short: "Фон и тема",
    doc: "README / ТЗ: фон чата и цвета пузырей (тема Telegram) на каждый проект.",
  },
  {
    id: "conditions",
    title: "Условия",
    short: "Картинка",
    doc: "ТЗ §2 п.2: актриса обязательно отправляет условия работы (картинка).",
  },
  {
    id: "texts",
    title: "Тексты",
    short: "Реквизиты",
    doc: "ТЗ §2 п.4–8: реквизиты депозита, завершение работы, выплата — свои на проект.",
  },
  {
    id: "media",
    title: "Живое медиа",
    short: "Ставки и кружки",
    doc: "ТЗ §3.2 и §4.5: в полном отзыве нужны фото / кружок / ставки из библиотеки.",
  },
  {
    id: "preview",
    title: "Пробный отзыв",
    short: "Проверка",
    doc: "Собрать скриншоты здесь, без публикации в канал — проверить сценарий целиком.",
  },
  {
    id: "launch",
    title: "Запуск",
    short: "Публикация",
    doc: "ТЗ §3.1 / §5: двухфазная публикация (Nancy) и автозапуск по расписанию.",
  },
];

function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/api/admin/media/file?path=${encodeURIComponent(path)}`;
}

export function ProjectConstructor({
  projects,
  initialStatus,
}: {
  projects: ConstructorProject[];
  initialStatus: string;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [stepIndex, setStepIndex] = useState(0);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState("");
  const [localProjects, setLocalProjects] = useState(projects);
  const [pickerKind, setPickerKind] = useState<
    null | "avatar" | "conditions" | "bet" | "video_note" | "story_photo"
  >(null);
  const [mediaPreview, setMediaPreview] = useState<{
    bet?: string | null;
    video_note?: string | null;
    story_photo?: string | null;
  }>({});
  const [genProgress, setGenProgress] = useState<{
    step: number;
    total: number;
    label: string;
    detail?: string;
    startedAt: number;
  } | null>(null);
  const [genTick, setGenTick] = useState(0);

  useEffect(() => {
    if (!genProgress) return;
    const id = window.setInterval(() => setGenTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [genProgress]);

  const project = localProjects.find((p) => p.id === projectId) ?? localProjects[0];
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)]!;
  const field = inputStyle();

  const [form, setForm] = useState({
    managerHandle: project?.managerHandle ?? "",
    managerName: project?.managerName ?? "",
    depositMessageTemplate: project?.depositMessageTemplate ?? "",
    completionMessageTemplate: project?.completionMessageTemplate ?? "",
    payoutMessageTemplate: project?.payoutMessageTemplate ?? "",
    incomingBubble: project?.theme.incomingBubble ?? "#FFFFFF",
    outgoingBubble: project?.theme.outgoingBubble ?? "#E7FCC4",
    accentColor: project?.theme.accentColor ?? "#34C759",
    twoPhaseReview: project?.twoPhaseReview ?? false,
  });

  useEffect(() => {
    if (!project) return;
    setForm({
      managerHandle: project.managerHandle,
      managerName: project.managerName,
      depositMessageTemplate: project.depositMessageTemplate,
      completionMessageTemplate: project.completionMessageTemplate,
      payoutMessageTemplate: project.payoutMessageTemplate,
      incomingBubble: project.theme.incomingBubble,
      outgoingBubble: project.theme.outgoingBubble,
      accentColor: project.theme.accentColor,
      twoPhaseReview: project.twoPhaseReview,
    });
    setScreenshots([]);
    setReviewId("");
    setMessage("");
    setMediaPreview({});
    setPickerKind(null);
  }, [project?.id]);

  const loadAssets = useCallback(async () => {
    const res = await fetch("/api/admin/media");
    const data = (await res.json()) as { assets?: MediaAsset[] };
    setAssets(data.assets ?? []);
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const counts = useMemo(() => {
    const forProject = (type: string) =>
      assets.filter((a) => a.type === type && a.projectId === projectId).length;
    const strict = (type: string) => assets.filter((a) => a.type === type && a.projectId === projectId).length;
    return {
      wallpaper: strict("wallpaper") > 0 || Boolean(project?.wallpaperPath),
      conditions:
        strict("conditions") > 0 ||
        Boolean(project?.conditionsImagePath) ||
        (project?.conditionsTexts?.length ?? 0) > 0,
      avatar: Boolean(project?.clientAvatarPath) || assets.some((a) => a.type === "avatar" && a.projectId === projectId),
      bet: forProject("bet"),
      video_note: forProject("video_note"),
      story_photo: assets.filter((a) => a.type === "story_photo").length,
    };
  }, [assets, projectId, project]);

  const avatarLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return assets.filter(
      (a) =>
        a.isImage &&
        (a.type === "story_photo" || (a.type === "avatar" && a.projectId === projectId)),
    );
  }, [assets, projectId]);

  const conditionsLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return assets.filter((a) => a.isImage && a.type === "conditions" && a.projectId === projectId);
  }, [assets, projectId]);

  const betLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return assets.filter((a) => a.isImage && a.type === "bet" && a.projectId === projectId);
  }, [assets, projectId]);

  const videoNoteLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return assets.filter((a) => a.isVideo && a.type === "video_note" && a.projectId === projectId);
  }, [assets, projectId]);

  const storyPhotoLibraryAssets = useMemo((): PickerMediaAsset[] => {
    return assets.filter((a) => a.isImage && a.type === "story_photo");
  }, [assets]);

  const activePickerAssets = useMemo(() => {
    switch (pickerKind) {
      case "avatar":
        return avatarLibraryAssets;
      case "conditions":
        return conditionsLibraryAssets;
      case "bet":
        return betLibraryAssets;
      case "video_note":
        return videoNoteLibraryAssets;
      case "story_photo":
        return storyPhotoLibraryAssets;
      default:
        return [];
    }
  }, [
    pickerKind,
    avatarLibraryAssets,
    conditionsLibraryAssets,
    betLibraryAssets,
    videoNoteLibraryAssets,
    storyPhotoLibraryAssets,
  ]);

  const stepDone = useMemo((): Record<StepId, boolean> => {
    return {
      project: Boolean(project),
      profile: Boolean(form.managerName.trim() && form.managerHandle.trim()),
      look: counts.wallpaper,
      conditions: counts.conditions,
      texts: Boolean(
        form.depositMessageTemplate.trim() &&
          form.completionMessageTemplate.trim() &&
          form.payoutMessageTemplate.trim(),
      ),
      media: counts.bet >= 3 && counts.video_note >= 1 && counts.story_photo >= 1,
      preview: screenshots.length > 0,
      launch: initialStatus === "running",
    };
  }, [project, form, counts, screenshots.length, initialStatus]);

  async function upload(type: string, file: File, requireProject = true) {
    if (requireProject && !projectId) {
      setMessage("Сначала выберите проект");
      return;
    }
    if (type === "conditions") {
      const ok = /\.(gif|jpe?g|png|webp)$/i.test(file.name) || /^image\/(gif|jpeg|png|webp)$/i.test(file.type);
      if (!ok) {
        setMessage("Для условий нужен файл JPG, PNG, WEBP или GIF");
        return;
      }
    }
    setBusy(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("file", file);
      if (projectId) fd.set("projectId", projectId);
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; message?: string; path?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setMessage(data.message ?? "Загружено");
      if (data.path) {
        setLocalProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) return p;
            if (type === "wallpaper") return { ...p, wallpaperPath: data.path! };
            if (type === "conditions") return { ...p, conditionsImagePath: data.path! };
            if (type === "avatar") return { ...p, clientAvatarPath: data.path! };
            return p;
          }),
        );
      }
      await loadAssets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function generateAiMedia(
    kind: "avatar" | "conditions" | "bet" | "story_photo" | "wallpaper" | "sticker",
    count = 1,
  ) {
    if (!project) return;
    if (kind !== "story_photo" && kind !== "sticker" && !projectId) {
      setMessage("Сначала выберите проект");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          count,
          projectId: project.id,
          clientName: kind === "avatar" || kind === "story_photo" ? undefined : form.managerName || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        path?: string;
        assets?: Array<{ url: string; path: string }>;
      };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка генерации ИИ");
      setMessage(data.message ?? "Сгенерировано через ИИ");
      if (data.path) {
        setLocalProjects((prev) =>
          prev.map((p) => {
            if (p.id !== project.id) return p;
            if (kind === "wallpaper") return { ...p, wallpaperPath: data.path! };
            if (kind === "conditions") return { ...p, conditionsImagePath: data.path! };
            if (kind === "avatar") return { ...p, clientAvatarPath: data.path! };
            return p;
          }),
        );
      }
      if (kind === "bet" && data.assets?.[0]?.url) {
        setMediaPreview((prev) => ({ ...prev, bet: data.assets![0]!.url }));
      }
      if (kind === "story_photo" && data.assets?.[0]?.url) {
        setMediaPreview((prev) => ({ ...prev, story_photo: data.assets![0]!.url }));
      }
      await loadAssets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка ИИ");
    } finally {
      setBusy(false);
    }
  }

  async function selectClientAvatar(asset: PickerMediaAsset) {
    if (!project) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientAvatarPath: asset.path }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить аватар");
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, clientAvatarPath: asset.path } : p)),
      );
      setPickerKind(null);
      setMessage("Аватар выбран из медиатеки");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function selectConditions(asset: PickerMediaAsset) {
    if (!project) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditionsImagePath: asset.path }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить условия");
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, conditionsImagePath: asset.path } : p)),
      );
      setPickerKind(null);
      setMessage("Условия выбраны из медиатеки");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function selectLibraryAsset(asset: PickerMediaAsset) {
    if (pickerKind === "avatar") {
      void selectClientAvatar(asset);
      return;
    }
    if (pickerKind === "conditions") {
      void selectConditions(asset);
      return;
    }
    if (pickerKind === "bet" || pickerKind === "video_note" || pickerKind === "story_photo") {
      setMediaPreview((prev) => ({ ...prev, [pickerKind]: asset.url }));
      setPickerKind(null);
      setMessage(
        pickerKind === "story_photo"
          ? "Фото уже в общем пуле — будет использовано в отзывах"
          : "Файл уже в медиатеке проекта — будет использован в отзывах",
      );
    }
  }

  async function saveSettings(extra?: Partial<typeof form>) {
    if (!project) return;
    setBusy(true);
    setMessage("");
    const next = { ...form, ...extra };
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerHandle: next.managerHandle,
          managerName: next.managerName,
          depositMessageTemplate: next.depositMessageTemplate,
          completionMessageTemplate: next.completionMessageTemplate,
          payoutMessageTemplate: next.payoutMessageTemplate,
          twoPhaseReview: project.id === "nancy" ? next.twoPhaseReview : false,
          theme: {
            incomingBubble: next.incomingBubble,
            outgoingBubble: next.outgoingBubble,
            accentColor: next.accentColor,
            headerBg: "#F7F7F7",
            statusBarStyle: "light",
          },
        }),
      });
      const data = (await res.json()) as { error?: string; project?: ConstructorProject };
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      setForm(next);
      if (data.project) {
        setLocalProjects((prev) =>
          prev.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  managerHandle: next.managerHandle,
                  managerName: next.managerName,
                  depositMessageTemplate: next.depositMessageTemplate,
                  completionMessageTemplate: next.completionMessageTemplate,
                  payoutMessageTemplate: next.payoutMessageTemplate,
                  twoPhaseReview: next.twoPhaseReview,
                  theme: {
                    incomingBubble: next.incomingBubble,
                    outgoingBubble: next.outgoingBubble,
                    accentColor: next.accentColor,
                  },
                }
              : p,
          ),
        );
      }
      setMessage("Сохранено");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function generatePreview() {
    if (!project) return;
    setBusy(true);
    setMessage("");
    setGenProgress({
      step: 0,
      total: 6,
      label: "Запуск…",
      detail: "Подключаемся к пайплайну",
      startedAt: Date.now(),
    });
    try {
      const res = await fetch("/api/pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          reviewType: "big",
          autoPublish: false,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Ошибка генерации");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const line = chunk
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          let event: {
            type?: string;
            step?: number;
            total?: number;
            label?: string;
            detail?: string;
            error?: string;
            reviewId?: string;
            screenshots?: string[];
          };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setGenProgress((prev) => ({
              step: event.step ?? 0,
              total: event.total ?? 6,
              label: event.label ?? "Работаем…",
              ...(event.detail ? { detail: event.detail } : {}),
              startedAt: prev?.startedAt ?? Date.now(),
            }));
          } else if (event.type === "done") {
            gotDone = true;
            setReviewId(event.reviewId ?? "");
            setScreenshots(event.screenshots ?? []);
            setMessage(`Готово: ${(event.screenshots ?? []).length} скринов`);
            setGenProgress(null);
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Ошибка генерации");
          }
        }
      }

      if (!gotDone) {
        throw new Error("Поток оборвался до завершения");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
      setGenProgress(null);
    } finally {
      setBusy(false);
    }
  }

  if (!project) {
    return <p className="admin-muted">Нет проектов в config/projects.json</p>;
  }

  return (
    <div className="ctor" data-tour="tour-constructor">
      <div className="ctor-rail" role="tablist" aria-label="Шаги конструктора">
        {STEPS.map((s, i) => {
          const done = stepDone[s.id];
          const active = i === stepIndex;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ctor-rail-item${active ? " is-active" : ""}${done ? " is-done" : ""}`}
              onClick={() => setStepIndex(i)}
            >
              <span className="ctor-rail-num">{done && !active ? "✓" : i + 1}</span>
              <span className="ctor-rail-text">
                <strong>{s.short}</strong>
                <span>{s.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="admin-card ctor-panel">
        <div className="ctor-panel-head">
          <div>
            <h2 className="admin-card-title">
              Шаг {stepIndex + 1}. {step.title}
              <HelpTip text={step.doc} />
            </h2>
            <p className="admin-card-desc" style={{ marginBottom: 0 }}>
              {step.doc}
            </p>
          </div>
          <div className="ctor-project-chip">
            <span className="admin-muted">Проект</span>
            <strong>
              {project.name}
              {project.id === "nancy" ? " · 2 фазы" : ""}
            </strong>
          </div>
        </div>

        {step.id === "project" && (
          <div className="ctor-projects">
            {localProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ctor-project-card${p.id === projectId ? " is-active" : ""}`}
                onClick={() => setProjectId(p.id)}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.managerHandle} · {p.locale} · {p.currency}
                </span>
                {p.twoPhaseReview ? <em>Двухчастные отзывы (ТЗ §4.2)</em> : null}
              </button>
            ))}
          </div>
        )}

        {step.id === "profile" && (
          <div className="ctor-form">
            <Field label={<LabelWithHelp label="Имя в шапке чата" tip="Видно вверху скриншота." />}>
              <input
                style={field}
                value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              />
            </Field>
            <Field label={<LabelWithHelp label="Ник в Telegram" tip="Например @Maya_Nancy." />}>
              <input
                style={field}
                value={form.managerHandle}
                onChange={(e) => setForm({ ...form, managerHandle: e.target.value })}
              />
            </Field>
            <LibraryPickBlock
              label="Аватар клиента (в шапке)"
              hint="Выберите фото из медиатеки — аватар проекта или общий пул клиентов."
              accept="image/*"
              previewUrl={
                fileUrl(project.clientAvatarPath) ??
                assets.find((a) => a.type === "avatar" && a.projectId === projectId)?.url ??
                null
              }
              disabled={busy}
              onPick={() => setPickerKind("avatar")}
              onFile={(f) => void upload("avatar", f)}
              onGenerateAi={() => void generateAiMedia("avatar")}
            />
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? "…" : "Сохранить профиль"}
            </button>
          </div>
        )}

        {step.id === "look" && (
          <div className="ctor-form">
            <UploadBlock
              label="Фон чата (обои)"
              hint="Один файл на проект — новая загрузка заменяет старую. Можно сгенерировать через ИИ."
              accept="image/*"
              previewUrl={fileUrl(project.wallpaperPath)}
              disabled={busy}
              onFile={(f) => void upload("wallpaper", f)}
              onGenerateAi={() => void generateAiMedia("wallpaper")}
            />
            <div className="ctor-colors">
              <Field label={<LabelWithHelp label="Пузырь клиента" tip="Входящие сообщения." />}>
                <input
                  type="color"
                  style={{ ...field, height: 40, padding: 2 }}
                  value={form.incomingBubble}
                  onChange={(e) => setForm({ ...form, incomingBubble: e.target.value })}
                />
              </Field>
              <Field label={<LabelWithHelp label="Пузырь менеджера" tip="Исходящие сообщения." />}>
                <input
                  type="color"
                  style={{ ...field, height: 40, padding: 2 }}
                  value={form.outgoingBubble}
                  onChange={(e) => setForm({ ...form, outgoingBubble: e.target.value })}
                />
              </Field>
              <Field label={<LabelWithHelp label="Акцент" tip="Галочки и детали UI." />}>
                <input
                  type="color"
                  style={{ ...field, height: 40, padding: 2 }}
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                />
              </Field>
            </div>
            <div
              className="ctor-theme-preview"
              style={{
                backgroundImage: project.wallpaperPath
                  ? `url(${fileUrl(project.wallpaperPath)})`
                  : "linear-gradient(180deg, #6ba3be, #4a8fa8)",
              }}
            >
              <div className="ctor-bubble" style={{ background: form.incomingBubble }}>
                Hola, ¿cómo funciona?
              </div>
              <div className="ctor-bubble is-out" style={{ background: form.outgoingBubble }}>
                <AppleEmojiText text="Te explico las condiciones 💙" />
              </div>
            </div>
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? "…" : "Сохранить цвета"}
            </button>
          </div>
        )}

        {step.id === "conditions" && (
          <div className="ctor-form">
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Условия из ТЗ Влада: картинка и/или фиксированный текст в{" "}
              <code>config/projects.json</code> (<code>conditionsTexts</code>).
            </p>
            {(project.conditionsTexts?.length ?? 0) > 0 ? (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.85rem",
                  lineHeight: 1.45,
                  padding: "0.75rem 0.9rem",
                  borderRadius: 10,
                  border: "1px solid var(--line-strong, #e5e7eb)",
                  background: "var(--surface-2, #f8fafc)",
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {project.conditionsTexts!.map((t, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : "0.75rem 0 0" }}>
                    {t}
                  </p>
                ))}
              </div>
            ) : (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Фиксированного текста нет — будет картинка (Nancy) или AI-текст, если нет медиа.
              </p>
            )}
            <LibraryPickBlock
              label="Картинка / GIF условий"
              hint="Можно JPG, PNG, WEBP или анимированный GIF. Nancy / Francesca обычно с картинкой; остальные проекты могут работать и только текстом."
              accept=".gif,.jpg,.jpeg,.png,.webp,image/gif,image/jpeg,image/png,image/webp"
              previewUrl={
                fileUrl(project.conditionsImagePath) ??
                assets.find((a) => a.type === "conditions" && a.projectId === projectId)?.url ??
                null
              }
              disabled={busy}
              onPick={() => setPickerKind("conditions")}
              onFile={(f) => void upload("conditions", f)}
              onGenerateAi={() => void generateAiMedia("conditions")}
            />
          </div>
        )}

        {step.id === "texts" && (
          <div className="ctor-form">
            <Field
              label={
                <LabelWithHelp
                  label="Реквизиты (депозит)"
                  tip="ТЗ §2 п.4. Подстановки: {{bankName}}, {{clabe}}, суммы."
                />
              }
            >
              <textarea
                style={{ ...field, minHeight: 88, resize: "vertical" }}
                value={form.depositMessageTemplate}
                onChange={(e) => setForm({ ...form, depositMessageTemplate: e.target.value })}
              />
            </Field>
            <Field
              label={
                <LabelWithHelp
                  label="Работа закончена"
                  tip="ТЗ §2 п.7. Можно {{deposit}} и {{profitFinal}}."
                />
              }
            >
              <textarea
                style={{ ...field, minHeight: 72, resize: "vertical" }}
                value={form.completionMessageTemplate}
                onChange={(e) => setForm({ ...form, completionMessageTemplate: e.target.value })}
              />
            </Field>
            <Field label={<LabelWithHelp label="Выплата отправлена" tip="ТЗ §2 п.8." />}>
              <textarea
                style={{ ...field, minHeight: 56, resize: "vertical" }}
                value={form.payoutMessageTemplate}
                onChange={(e) => setForm({ ...form, payoutMessageTemplate: e.target.value })}
              />
            </Field>
            {project.id === "nancy" && (
              <label className="ctor-check">
                <input
                  type="checkbox"
                  checked={form.twoPhaseReview}
                  onChange={(e) => setForm({ ...form, twoPhaseReview: e.target.checked })}
                />
                Двухчастная публикация (~{project.phaseDelayMinutes} мин) — ТЗ §4.2, только Nancy
              </label>
            )}
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? "…" : "Сохранить тексты"}
            </button>
          </div>
        )}

        {step.id === "media" && (
          <div className="ctor-form">
            <div className="ctor-media-stats">
              <Stat ok={counts.bet >= 3} label="Ставки" value={`${counts.bet} / 3+`} />
              <Stat ok={counts.video_note >= 1} label="Кружки" value={`${counts.video_note}`} />
              <Stat ok={counts.story_photo >= 1} label="Фото клиентов" value={`${counts.story_photo}`} />
            </div>
            <LibraryPickBlock
              label="Ставка (скрин)"
              hint="ТЗ: 3 ставки в истории с паузами. Медиатека, загрузка или ИИ."
              accept="image/*"
              previewUrl={
                mediaPreview.bet ??
                assets.find((a) => a.type === "bet" && a.projectId === projectId)?.url ??
                null
              }
              disabled={busy}
              onPick={() => setPickerKind("bet")}
              onFile={(f) => void upload("bet", f)}
              onGenerateAi={() => void generateAiMedia("bet", 3)}
              aiLabel="Сгенерировать 3 ставки через ИИ"
            />
            <LibraryPickBlock
              label="Кружок (MP4)"
              hint="Обязателен для «живого» полного отзыва (ТЗ §3.2)."
              accept="video/mp4,video/quicktime"
              previewUrl={
                mediaPreview.video_note ??
                assets.find((a) => a.type === "video_note" && a.projectId === projectId)?.url ??
                null
              }
              previewIsVideo
              aiAvailable={false}
              disabled={busy}
              onPick={() => setPickerKind("video_note")}
              onFile={(f) => void upload("video_note", f)}
            />
            <LibraryPickBlock
              label="Фото клиента"
              hint="Общий пул: каждое фото — один раз. ИИ генерирует фото болеющего (больница), не селфи."
              accept="image/*"
              previewUrl={
                mediaPreview.story_photo ??
                assets.find((a) => a.type === "story_photo")?.url ??
                null
              }
              disabled={busy}
              onPick={() => setPickerKind("story_photo")}
              onFile={(f) => void upload("story_photo", f, false)}
              onGenerateAi={() => void generateAiMedia("story_photo", 3)}
              aiLabel="Сгенерировать фото через ИИ"
            />
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Чеки не грузятся вручную: ИИ правит образцы из{" "}
              <code>data/media/receipt_templates/{project.id}</code>.
            </p>
          </div>
        )}

        {step.id === "preview" && (
          <div className="ctor-form">
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Полный сценарий из ТЗ §2: контакт → условия → депозит → ставки → выплата. В канал не уйдёт.
              Генерация чеков через ИИ обычно занимает 1–2 минуты — это нормально.
            </p>
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void generatePreview()}>
              {busy ? "Генерируем…" : "Сделать пробный отзыв"}
            </button>
            {genProgress ? (
              <div className="ctor-progress" aria-live="polite">
                <div className="ctor-progress-head">
                  <strong>
                    Шаг {genProgress.step}/{genProgress.total}: {genProgress.label}
                  </strong>
                  <span>
                    {/* genTick forces re-render each second while generating */}
                    {Math.max(0, Math.floor((Date.now() - genProgress.startedAt) / 1000))}
                    {genTick >= 0 ? " с" : " с"}
                  </span>
                </div>
                <div className="ctor-progress-bar">
                  <i
                    style={{
                      width: `${Math.min(100, Math.round((genProgress.step / Math.max(1, genProgress.total)) * 100))}%`,
                    }}
                  />
                </div>
                {genProgress.detail ? <p>{genProgress.detail}</p> : null}
                <ol className="ctor-progress-steps">
                  {[
                    "Диалог",
                    "Медиа",
                    "Фото клиента",
                    "Чеки (ИИ)",
                    "Скриншоты",
                    "Сохранение",
                  ].map((name, i) => {
                    const n = i + 1;
                    const done = genProgress.step > n;
                    const active = genProgress.step === n;
                    return (
                      <li key={name} className={done ? "is-done" : active ? "is-active" : ""}>
                        {done ? "✓" : active ? "●" : "○"} {name}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
            {screenshots.length > 0 ? (
              <ScreenshotGallery screenshots={screenshots} reviewId={reviewId} />
            ) : (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                Скриншотов пока нет.
              </p>
            )}
          </div>
        )}

        {step.id === "launch" && (
          <div className="ctor-form">
            <div className="ctor-ready">
              {(
                [
                  ["Профиль", stepDone.profile],
                  ["Фон чата", stepDone.look],
                  ["Условия", stepDone.conditions],
                  ["Тексты", stepDone.texts],
                  ["Медиа", stepDone.media],
                  ["Пробный отзыв", stepDone.preview],
                ] as const
              ).map(([label, ok]) => (
                <div key={label} className={`ctor-ready-row${ok ? " is-ok" : ""}`}>
                  <span>{ok ? "✓" : "○"}</span>
                  {label}
                </div>
              ))}
            </div>
            {project.twoPhaseReview && (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                Nancy: фаза 1 = 4 скрина сразу; фаза 2 через ~{project.phaseDelayMinutes} мин — полный альбом +
                медиа (ТЗ §3.1).
              </p>
            )}
            <ControlButtons currentStatus={initialStatus} />
          </div>
        )}

        {message ? (
          <p className="admin-muted" style={{ margin: "0.85rem 0 0", fontSize: "0.875rem" }}>
            {message}
          </p>
        ) : null}

        <div className="ctor-nav">
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Назад
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={stepIndex >= STEPS.length - 1}
            onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
          >
            Далее
          </button>
        </div>
      </section>

      <MediaPicker
        open={pickerKind !== null}
        title={
          pickerKind === "avatar"
            ? "Аватар из медиатеки"
            : pickerKind === "conditions"
              ? "Условия из медиатеки"
              : pickerKind === "bet"
                ? "Ставки из медиатеки"
                : pickerKind === "video_note"
                  ? "Кружки из медиатеки"
                  : pickerKind === "story_photo"
                    ? "Фото клиентов из медиатеки"
                    : "Медиатека"
        }
        emptyHint={
          pickerKind === "story_photo"
            ? "В общем пуле пока пусто. Загрузите фото ниже или во вкладке «Медиатека»."
            : "В медиатеке проекта пока нет таких файлов. Загрузите новый файл кнопкой рядом или во вкладке «Медиатека»."
        }
        footNote={
          pickerKind === "story_photo"
            ? "Общий пул фото клиентов — каждое используется один раз."
            : "Файлы проекта из раздела «Медиатека»."
        }
        assets={activePickerAssets}
        selectedPath={
          pickerKind === "avatar"
            ? project?.clientAvatarPath
            : pickerKind === "conditions"
              ? project?.conditionsImagePath
              : null
        }
        allowVideo={pickerKind === "video_note"}
        disabled={busy}
        onClose={() => setPickerKind(null)}
        onSelect={selectLibraryAsset}
      />
    </div>
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

function Stat({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className={`ctor-stat${ok ? " is-ok" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LibraryPickBlock({
  label,
  hint,
  accept = "image/*",
  previewUrl,
  previewIsVideo = false,
  disabled,
  aiAvailable = true,
  aiLabel = "Сгенерировать через ИИ",
  onPick,
  onFile,
  onGenerateAi,
}: {
  label: string;
  hint: string;
  accept?: string;
  previewUrl?: string | null;
  previewIsVideo?: boolean;
  disabled?: boolean;
  /** Show AI checkbox alternative (images only). */
  aiAvailable?: boolean;
  aiLabel?: string;
  onPick: () => void;
  onFile: (file: File) => void;
  onGenerateAi?: () => void;
}) {
  const [useAi, setUseAi] = useState(false);

  return (
    <div className="ctor-upload">
      <div className="ctor-upload-meta">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <div className="ctor-upload-row">
        {previewUrl ? (
          previewIsVideo ? (
            <div className="ctor-upload-preview is-video" title="Видео в медиатеке">
              MP4
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="ctor-upload-preview" />
          )
        ) : (
          <div className="ctor-upload-preview is-empty">нет</div>
        )}
        <div className="ctor-upload-actions">
          <button type="button" className="admin-btn" disabled={disabled} onClick={onPick}>
            Выбрать из медиатеки
          </button>
          {aiAvailable && onGenerateAi ? (
            <label className="ctor-ai-check">
              <input
                type="checkbox"
                checked={useAi}
                disabled={disabled}
                onChange={(e) => setUseAi(e.target.checked)}
              />
              {aiLabel}
            </label>
          ) : null}
          {useAi && aiAvailable && onGenerateAi ? (
            <button type="button" className="admin-btn" disabled={disabled} onClick={onGenerateAi}>
              {disabled ? "Генерация…" : "Сгенерировать"}
            </button>
          ) : (
            <input
              type="file"
              accept={accept}
              disabled={disabled}
              title="Загрузить новый файл в медиатеку"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.currentTarget.value = "";
              }}
            />
          )}
        </div>
      </div>
      {!aiAvailable ? (
        <span className="ctor-ai-note">Кружки (MP4) ИИ не рисует — только загрузка / медиатека.</span>
      ) : null}
    </div>
  );
}

function UploadBlock({
  label,
  hint,
  accept,
  previewUrl,
  disabled,
  onFile,
  onGenerateAi,
}: {
  label: string;
  hint: string;
  accept: string;
  previewUrl?: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  onGenerateAi?: () => void;
}) {
  const [useAi, setUseAi] = useState(false);
  return (
    <div className="ctor-upload">
      <div className="ctor-upload-meta">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <div className="ctor-upload-row">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="ctor-upload-preview" />
        ) : (
          <div className="ctor-upload-preview is-empty">нет</div>
        )}
        <div className="ctor-upload-actions">
          {onGenerateAi ? (
            <label className="ctor-ai-check">
              <input
                type="checkbox"
                checked={useAi}
                disabled={disabled}
                onChange={(e) => setUseAi(e.target.checked)}
              />
              Сгенерировать через ИИ
            </label>
          ) : null}
          {useAi && onGenerateAi ? (
            <button type="button" className="admin-btn" disabled={disabled} onClick={onGenerateAi}>
              {disabled ? "Генерация…" : "Сгенерировать"}
            </button>
          ) : (
            <input
              type="file"
              accept={accept}
              disabled={disabled}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.currentTarget.value = "";
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
