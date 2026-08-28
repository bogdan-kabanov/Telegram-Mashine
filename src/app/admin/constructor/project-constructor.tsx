"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { splitProfitProgression, type CustomAmounts } from "@/lib/amounts/split-profit";
import { withBasePath } from "@/lib/base-path";

import { ControlButtons } from "../control-buttons";
import { ScreenshotGallery } from "../screenshot-gallery";
import { inputStyle } from "../styles";
import { HelpTip, LabelWithHelp } from "../ui/HelpTip";
import { MediaPicker, type PickerMediaAsset } from "../ui/MediaPicker";
import { LivePreviewPane, applyLibraryPick, type LiveMediaPaths } from "./live-preview-pane";

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

function parseAmountInput(raw: string): number {
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return withBasePath(`/api/admin/media/file?path=${encodeURIComponent(path)}`);
}

export interface ConstructorAmountPack {
  id: string;
  projectId?: string | undefined;
  betPack?: number | undefined;
  deposit: number;
  profit1: number;
  profit2: number;
  profit3?: number;
  profitFinal: number;
  currency: string;
}

export function ProjectConstructor({
  projects,
  amountPacks,
  initialStatus,
}: {
  projects: ConstructorProject[];
  amountPacks: ConstructorAmountPack[];
  initialStatus: string;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState("");
  const [localProjects, setLocalProjects] = useState(projects);
  const [pickerKind, setPickerKind] = useState<
    null | "avatar" | "wallpaper" | "conditions" | "bet" | "video_note" | "story_photo"
  >(null);
  const [livePickSlot, setLivePickSlot] = useState<string | null>(null);
  const [liveMedia, setLiveMedia] = useState<LiveMediaPaths>({});
  const [slideTimesIso, setSlideTimesIso] = useState<string[]>([]);
  const [amountPackId, setAmountPackId] = useState("");
  const [customProfitFinal, setCustomProfitFinal] = useState("");
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
  const projectPacks = useMemo(() => {
    const scoped = amountPacks.filter((p) => p.projectId === projectId);
    if (scoped.length > 0) return scoped;
    const currency = project?.currency;
    return amountPacks.filter((p) => !p.projectId && (!currency || p.currency === currency));
  }, [amountPacks, projectId, project?.currency]);
  const selectedPack = projectPacks.find((p) => p.id === amountPackId) ?? null;
  const computedCustomAmounts = useMemo((): CustomAmounts | null => {
    const profitFinal = parseAmountInput(customProfitFinal);
    if (profitFinal <= 0) return null;
    return splitProfitProgression({ profitFinal });
  }, [customProfitFinal]);
  const effectiveAmounts = computedCustomAmounts ?? selectedPack ?? null;
  const field = inputStyle();
  const handleSlideTimes = useCallback((iso: string[]) => {
    setSlideTimesIso(iso);
  }, []);

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
    setLivePickSlot(null);
    setLiveMedia({});
    setSlideTimesIso([]);
    setAmountPackId("");
    setCustomProfitFinal("");
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

  const wallpaperLibraryAssets = useMemo((): PickerMediaAsset[] => {
    const pid = projectId.toLowerCase();
    return assets.filter((a) => {
      if (!a.isImage) return false;
      const isWallpaper =
        a.type === "wallpaper" || a.path.replace(/\\/g, "/").includes("/wallpapers/");
      if (!isWallpaper) return false;
      const base = a.path.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
      return base.toLowerCase() === pid || a.projectId === projectId;
    });
  }, [assets, projectId]);

  const activePickerAssets = useMemo(() => {
    switch (pickerKind) {
      case "avatar":
        return avatarLibraryAssets;
      case "wallpaper":
        return wallpaperLibraryAssets;
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
    wallpaperLibraryAssets,
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
    if (kind === "bet" && !effectiveAmounts) {
      setMessage("Укажите итоговую прибыль или выберите пак сумм");
      return;
    }
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
          ...(kind === "bet" && effectiveAmounts
            ? {
                deposit: effectiveAmounts.deposit,
                profit1: effectiveAmounts.profit1,
                profit2: effectiveAmounts.profit2,
                profit3:
                  "profit3" in effectiveAmounts && effectiveAmounts.profit3 > 0
                    ? effectiveAmounts.profit3
                    : effectiveAmounts.profitFinal - effectiveAmounts.profit1 - effectiveAmounts.profit2,
                profitFinal: effectiveAmounts.profitFinal,
                randomPack: !selectedPack || computedCustomAmounts != null,
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        path?: string;
        assets?: Array<{ url: string; path: string }>;
      };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Ошибка генерации ИИ");
      setMessage(
        kind === "bet"
          ? (data.message ?? "Суммы проставлены на исходных скринах ставок")
          : (data.message ?? "Сгенерировано через ИИ"),
      );
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
      if (kind === "bet" && data.assets?.length) {
        setLiveMedia((prev) => {
          const next = { ...prev };
          if (data.assets![0]?.path) next.bet1 = data.assets![0].path;
          if (data.assets![1]?.path) next.bet2 = data.assets![1].path;
          if (data.assets![2]?.path) next.bet3 = data.assets![2].path;
          return next;
        });
        if (data.assets[0]?.url) {
          setMediaPreview((prev) => ({ ...prev, bet: data.assets![0]!.url }));
        }
      }
      if (kind === "story_photo" && data.assets?.[0]?.path) {
        setLiveMedia((prev) => ({ ...prev, storyPhoto: data.assets![0]!.path }));
        setMediaPreview((prev) => ({ ...prev, story_photo: data.assets![0]!.url }));
      }
      if (kind === "conditions" && data.path) {
        setLiveMedia((prev) => ({ ...prev, conditions: data.path! }));
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

  async function selectWallpaper(asset: PickerMediaAsset) {
    if (!project) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallpaperPath: asset.path }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить фон");
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, wallpaperPath: asset.path } : p)),
      );
      setPickerKind(null);
      setMessage("Фон выбран из медиатеки");
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
    if (livePickSlot === "avatar" || pickerKind === "avatar") {
      void selectClientAvatar(asset);
      setLivePickSlot(null);
      return;
    }
    if (pickerKind === "wallpaper") {
      void selectWallpaper(asset);
      return;
    }
    if (livePickSlot) {
      setLiveMedia((prev) => applyLibraryPick(livePickSlot, asset, prev));
      if (reviewId) {
        void fetch(`/api/admin/reviews/${reviewId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "replaceMedia", slot: livePickSlot, path: asset.path }),
        });
      }
      setLivePickSlot(null);
      setPickerKind(null);
      setMessage("Медиа в превью заменено");
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
          ...(slideTimesIso.length ? { slideTimes: slideTimesIso } : {}),
          ...(computedCustomAmounts
            ? { customAmounts: computedCustomAmounts }
            : amountPackId
              ? { amountPackId }
              : {}),
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

  function openLivePicker(slot: string) {
    setLivePickSlot(slot);
    if (slot === "storyPhoto") setPickerKind("story_photo");
    else if (slot === "conditions") setPickerKind("conditions");
    else if (slot === "avatar") setPickerKind("avatar");
    else if (slot.startsWith("bet")) setPickerKind("bet");
    else setPickerKind(null);
  }

  if (!project) {
    return <p className="admin-muted">Нет проектов в config/projects.json</p>;
  }

  return (
    <div className="ctor ctor-split" data-tour="tour-constructor">
      <div className="ctor-split-main">
        <nav className="ctor-jump" aria-label="Разделы конструктора">
          {STEPS.map((s) => (
            <a
              key={s.id}
              href={`#ctor-${s.id}`}
              className={`ctor-jump-item${stepDone[s.id] ? " is-done" : ""}`}
            >
              {stepDone[s.id] ? "✓" : "·"} {s.short}
            </a>
          ))}
        </nav>

        <section id="ctor-project" className="admin-card ctor-section">
          <div className="ctor-section-head">
            <h2 className="admin-card-title">
              Проект
              <HelpTip text={STEPS[0]!.doc} />
            </h2>
            <div className="ctor-project-chip">
              <span className="admin-muted">Сейчас</span>
              <strong>
                {project.name}
                {project.id === "nancy" ? " · 2 фазы" : ""}
              </strong>
            </div>
          </div>
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
        </section>

        <section id="ctor-profile" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Профиль
            <HelpTip text={STEPS[1]!.doc} />
          </h2>
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
              hint="Сначала из медиатеки (аватар проекта или общий пул). С компьютера — если нужен новый файл."
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
        </section>

        <section id="ctor-look" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Вид чата
            <HelpTip text={STEPS[2]!.doc} />
          </h2>
          <div className="ctor-form">
            <LibraryPickBlock
              label="Фон чата (обои)"
              hint="Сначала из медиатеки. С компьютера — если файла ещё нет. ИИ нарисует новый фон."
              accept="image/*"
              previewUrl={fileUrl(project.wallpaperPath)}
              disabled={busy}
              onPick={() => setPickerKind("wallpaper")}
              onFile={(f) => void upload("wallpaper", f)}
              onGenerateAi={() => void generateAiMedia("wallpaper")}
              aiLabel="Сгенерировать ИИ"
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
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Цвета и фон сразу видны в живом отзыве справа — тот же HTML, что у скриншотов.
            </p>
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? "…" : "Сохранить цвета"}
            </button>
          </div>
        </section>

        <section id="ctor-conditions" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Условия
            <HelpTip text={STEPS[3]!.doc} />
          </h2>
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
        </section>

        <section id="ctor-texts" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Тексты
            <HelpTip text={STEPS[4]!.doc} />
          </h2>
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
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={form.twoPhaseReview}
                  onChange={(e) => setForm({ ...form, twoPhaseReview: e.target.checked })}
                />
                <span>Двухчастная публикация (~{project.phaseDelayMinutes} мин) — ТЗ §4.2, только Nancy</span>
              </label>
            )}
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? "…" : "Сохранить тексты"}
            </button>
          </div>
        </section>

        <section id="ctor-media" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Живое медиа
            <HelpTip text={STEPS[5]!.doc} />
          </h2>
          <div className="ctor-form">
            <div className="ctor-media-stats">
              <Stat ok={counts.bet >= 3} label="Ставки" value={`${counts.bet} / 3+`} />
              <Stat ok={counts.video_note >= 1} label="Кружки" value={`${counts.video_note}`} />
              <Stat ok={counts.story_photo >= 1} label="Фото клиентов" value={`${counts.story_photo}`} />
            </div>
            <LibraryPickBlock
              label="Ставка (скрин)"
              hint="ТЗ: 3 ставки в истории с паузами. Загрузите готовые скрины без сумм — укажите «Итоговую прибыль» ниже в «Полном отзыве» и нажмите «Проставить суммы»."
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
              aiLabel="Проставить суммы на 3 ставках"
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
              aiLabel="ИИ: фото"
            />
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Чеки не грузятся вручную: на исходном скрине из{" "}
              <code>data/media/receipt_templates/{project.id}</code> подставляются сумма, имена, дата
              и 4 цифры счёта. Ставки — так же: суммы на готовом скрине, ИИ кадр не перерисовывает.
              Клик по чеку или ставке справа — указать сумму и перепечатать поля.
            </p>
          </div>
        </section>

        <section id="ctor-preview" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Полный отзыв
            <HelpTip text="Необязательно, чтобы увидеть чат справа. Собирает диалог ИИ, чеки и PNG для канала." />
          </h2>
          <div className="ctor-form">
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Чат справа уже живой. Эта кнопка собирает полный пакет: диалог ИИ, чеки и PNG для
              публикации. В канал не уйдёт. Обычно 1–2 минуты.
            </p>
            <Field
              label={
                <LabelWithHelp
                  label="Итоговая прибыль клиента"
                  tip="Сколько клиент заработает к концу (3-я ставка). Система сама разобьёт на 3 ставки (25% / 35% / 40%), посчитает депозит (~1–5% от прибыли) и перепишет суммы на скринах ставок и чеке captura."
                />
              }
            >
              <input
                className="admin-input"
                style={field}
                inputMode="numeric"
                placeholder={`например 10000 ${project.currency}`}
                value={customProfitFinal}
                onChange={(e) => setCustomProfitFinal(e.target.value)}
              />
            </Field>
            {computedCustomAmounts ? (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Ставка 1: {computedCustomAmounts.profit1} {project.currency} → ставка 2:{" "}
                {computedCustomAmounts.profit2} → ставка 3: {computedCustomAmounts.profit3} → итог:{" "}
                {computedCustomAmounts.profitFinal}. Депозит в банк:{" "}
                {computedCustomAmounts.deposit} {project.currency}. На скринах OKX — Depósito:{" "}
                {computedCustomAmounts.deposit1} / {computedCustomAmounts.deposit2} /{" "}
                {computedCustomAmounts.deposit3} (реинвест после каждой ставки). Скрины — случайный
                пак из медиатеки.
              </p>
            ) : null}
            <Field
              label={
                <LabelWithHelp
                  label="Или готовый пак сумм"
                  tip="Устаревший режим: пак из config/amounts.json. Если указана итоговая прибыль выше — она важнее."
                />
              }
            >
              <select
                className="admin-select"
                style={field}
                value={amountPackId}
                onChange={(e) => setAmountPackId(e.target.value)}
              >
                <option value="">Авто — следующий пак по циклу ставок</option>
                {projectPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.betPack ? `Пак ${pack.betPack}` : pack.id}: депозит {pack.deposit} → выплата{" "}
                    {pack.profitFinal} {pack.currency}
                  </option>
                ))}
              </select>
            </Field>
            {effectiveAmounts ? (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Чек депозита: {effectiveAmounts.deposit} {project.currency}. Чек выплаты:{" "}
                {effectiveAmounts.profitFinal} {project.currency}
                {project.id === "francesca" ? " (минус 10% комиссия на чеке)" : ""}. Имена на чеке —
                клиент и {form.managerName || "менеджер"}.
              </p>
            ) : (
              <p className="admin-muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Укажите итоговую прибыль или выберите готовый пак. Без сумм отзыв соберётся из
                цикла amounts.json.
              </p>
            )}
            <button type="button" className="admin-btn" disabled={busy} onClick={() => void generatePreview()}>
              {busy ? "Собираем…" : "Собрать полный отзыв (ИИ)"}
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
                PNG-альбом появится после сборки полного отзыва. Живой чат справа уже 1:1.
              </p>
            )}
          </div>
        </section>

        <section id="ctor-launch" className="admin-card ctor-section">
          <h2 className="admin-card-title">
            Запуск
            <HelpTip text={STEPS[7]!.doc} />
          </h2>
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
        </section>

        {message ? (
          <p className="admin-muted" style={{ margin: "0.85rem 0 0", fontSize: "0.875rem" }}>
            {message}
          </p>
        ) : null}
      </div>

      <LivePreviewPane
        projectId={project.id}
        locale={project.locale}
        reviewId={reviewId}
        overrides={{
          managerName: form.managerName,
          managerHandle: form.managerHandle,
          incomingBubble: form.incomingBubble,
          outgoingBubble: form.outgoingBubble,
          accentColor: form.accentColor,
          depositMessageTemplate: form.depositMessageTemplate,
          completionMessageTemplate: form.completionMessageTemplate,
          payoutMessageTemplate: form.payoutMessageTemplate,
          wallpaperPath: project.wallpaperPath,
          clientAvatarPath: liveMedia.avatar ?? project.clientAvatarPath,
        }}
        mediaPaths={{
          ...liveMedia,
          conditions: liveMedia.conditions ?? project.conditionsImagePath,
          avatar: liveMedia.avatar ?? project.clientAvatarPath,
        }}
        onReviewId={setReviewId}
        onMediaPaths={setLiveMedia}
        onPickMedia={openLivePicker}
        onError={(msg) => setMessage(msg ?? "")}
        onSlideTimes={handleSlideTimes}
        amountDefaults={{
          currency: selectedPack?.currency ?? project.currency,
          deposit: effectiveAmounts?.deposit ?? null,
          payout: effectiveAmounts
            ? project.id === "francesca"
              ? Math.round(effectiveAmounts.profitFinal * 0.9)
              : effectiveAmounts.profitFinal
            : null,
          profit1: effectiveAmounts?.profit1 ?? null,
          profit2: effectiveAmounts?.profit2 ?? null,
          profit3:
            effectiveAmounts
              ? effectiveAmounts.profit3 && effectiveAmounts.profit3 > 0
                ? effectiveAmounts.profit3
                : effectiveAmounts.profitFinal - effectiveAmounts.profit1 - effectiveAmounts.profit2
              : null,
          profitFinal: effectiveAmounts?.profitFinal ?? null,
        }}
      />

      <MediaPicker
        open={pickerKind !== null}
        title={
          pickerKind === "avatar"
            ? "Аватар из медиатеки"
            : pickerKind === "wallpaper"
              ? "Фон чата из медиатеки"
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
            ? "В общем пуле пока пусто. Загрузите фото кнопкой «С компьютера» или во вкладке «Медиатека»."
            : pickerKind === "wallpaper"
              ? "Нет обоев для этого проекта. Загрузите файл кнопкой «С компьютера» или во вкладке «Медиатека»."
              : "В медиатеке проекта пока нет таких файлов. Загрузите новый файл кнопкой «С компьютера» или во вкладке «Медиатека»."
        }
        footNote={
          pickerKind === "story_photo"
            ? "Общий пул фото клиентов — каждое используется один раз."
            : pickerKind === "wallpaper"
              ? "Выбор сразу ставит фон для этого проекта."
              : "Файлы проекта из раздела «Медиатека»."
        }
        assets={activePickerAssets}
        selectedPath={
          pickerKind === "avatar"
            ? project?.clientAvatarPath
            : pickerKind === "wallpaper"
              ? project?.wallpaperPath
              : pickerKind === "conditions"
                ? project?.conditionsImagePath
                : null
        }
        allowVideo={pickerKind === "video_note"}
        disabled={busy}
        onClose={() => {
          setPickerKind(null);
          setLivePickSlot(null);
        }}
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
  aiLabel = "Сгенерировать ИИ",
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
  aiAvailable?: boolean;
  aiLabel?: string;
  onPick: () => void;
  onFile: (file: File) => void;
  onGenerateAi?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

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
            Из медиатеки
          </button>
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            С компьютера
          </button>
          {aiAvailable && onGenerateAi ? (
            <button type="button" className="admin-btn-ghost" disabled={disabled} onClick={onGenerateAi}>
              {aiLabel}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            disabled={disabled}
            className="ctor-file-input"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      {!aiAvailable ? (
        <span className="ctor-ai-note">Кружки (MP4) ИИ не рисует — только медиатека или файл с компьютера.</span>
      ) : null}
    </div>
  );
}
