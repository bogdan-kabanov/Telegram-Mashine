import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mediaFileUrl } from "../api/client";
import { DataTable } from "../components/DataTable";
import { FolderPicker } from "../components/FolderPicker";
import { Lightbox } from "../components/Lightbox";
import { ProjectEditor, type ProjectDraft } from "../components/ProjectEditor";
import { RowPopup } from "../components/RowPopup";

type Tab =
  | "projects"
  | "reviews"
  | "media"
  | "schedule"
  | "legends"
  | "ai"
  | "bets";

type Project = ProjectDraft;

type AmountPackRow = {
  id: string;
  projectId?: string;
  profitFinal: number;
  currency: string;
};

type ReviewRow = {
  id: string;
  projectId: string;
  clientName: string;
  phase: string;
  createdAt: string;
  screenshots: string[];
};

type ReviewFull = {
  id: string;
  projectId: string;
  clientName: string;
  dialog?: {
    messages: Array<{ id?: string; type: string; content?: string; role?: string }>;
    deposit?: number;
    payoutAmount?: number;
  } | null;
  renderMedia?: Record<string, string | null | undefined> | null;
  screenshots: string[];
  dialogTranslations?: Record<string, string> | null;
};

const SLOTS = [
  "captura",
  "receipt",
  "bet1",
  "bet2",
  "bet3",
  "sticker",
  "storyPhoto",
  "conditions",
] as const;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "projects", label: "Проекты" },
  { id: "reviews", label: "Отзывы" },
  { id: "media", label: "Медиа" },
  { id: "schedule", label: "Расписание" },
  { id: "legends", label: "Истории" },
  { id: "ai", label: "ИИ" },
  { id: "bets", label: "Ставки" },
];

export function WorkspacePage() {
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [popup, setPopup] = useState<
    | { kind: "project"; id: string }
    | { kind: "review"; id: string }
    | { kind: "legend"; id: string }
    | null
  >(null);

  const [projectDraft, setProjectDraft] = useState<Project | null>(null);
  const [review, setReview] = useState<ReviewFull | null>(null);
  const [aiFix, setAiFix] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [slotAmount, setSlotAmount] = useState("");
  const [legends, setLegends] = useState<Array<Record<string, unknown>>>([]);
  const [schedule, setSchedule] = useState<Record<string, unknown> | null>(null);
  const [allPacks, setAllPacks] = useState<AmountPackRow[]>([]);
  const [aiSettings, setAiSettings] = useState<{
    hasApiKey?: boolean;
    apiKeySource?: string;
    apiKeyHint?: string | null;
    AI_DIALOG?: string;
    AI_CLIENT_PHOTOS?: string;
    AI_RECEIPTS?: string;
    AI_MEDIA?: string;
    OPENAI_MODEL?: string;
    OPENAI_IMAGE_MODEL?: string;
    OPENAI_RECEIPT_IMAGE_MODEL?: string;
  } | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    const [st, amounts] = await Promise.all([
      api<{ config: { projects: Project[] } }>("/api/admin/status"),
      api<{ packs: AmountPackRow[] }>("/api/admin/amounts"),
    ]);
    setProjects(st.config.projects ?? []);
    setAllPacks(amounts.packs ?? []);
    if (!projectFilter && st.config.projects?.[0]) {
      setProjectFilter(st.config.projects[0].id);
    }
  }, [projectFilter]);

  const loadReviews = useCallback(async () => {
    if (!projectFilter) {
      setReviews([]);
      return;
    }
    const data = await api<{ reviews: ReviewRow[] }>(
      `/api/admin/reviews?projectId=${encodeURIComponent(projectFilter)}&limit=50`,
    );
    setReviews(data.reviews ?? []);
  }, [projectFilter]);

  const loadLegends = useCallback(async () => {
    const data = await api<{ legends: Array<Record<string, unknown>> }>("/api/admin/legends");
    setLegends(data.legends ?? []);
  }, []);

  const loadSchedule = useCallback(async () => {
    const data = await api<Record<string, unknown>>("/api/admin/schedule");
    setSchedule(data);
  }, []);

  const loadAi = useCallback(async () => {
    const [ai, proxy] = await Promise.all([
      api<{
        settings: {
          hasApiKey?: boolean;
          apiKeySource?: string;
          apiKeyHint?: string | null;
          AI_DIALOG?: string;
          AI_CLIENT_PHOTOS?: string;
          AI_RECEIPTS?: string;
          AI_MEDIA?: string;
          OPENAI_MODEL?: string;
          OPENAI_IMAGE_MODEL?: string;
          OPENAI_RECEIPT_IMAGE_MODEL?: string;
        };
      }>("/api/admin/settings/ai"),
      api<{ settings?: { PROXY_URL?: string }; PROXY_URL?: string }>("/api/admin/settings/proxy"),
    ]);
    setAiSettings(ai.settings);
    setApiKeyDraft("");
    setClearApiKey(false);
    setProxyUrl(proxy.settings?.PROXY_URL ?? proxy.PROXY_URL ?? "");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        await loadProjects();
      } catch (e) {
        setError(e instanceof Error ? e.message : "load failed");
      }
    })();
  }, [loadProjects]);

  useEffect(() => {
    if (tab === "reviews") void loadReviews().catch((e) => setError(String(e.message ?? e)));
    if (tab === "legends") void loadLegends().catch((e) => setError(String(e.message ?? e)));
    if (tab === "schedule") void loadSchedule().catch((e) => setError(String(e.message ?? e)));
    if (tab === "ai") void loadAi().catch((e) => setError(String(e.message ?? e)));
  }, [tab, loadReviews, loadLegends, loadSchedule, loadAi]);

  async function openProject(id: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ project: Project }>(`/api/admin/projects/${id}`);
      setProjectDraft({ ...data.project });
      setPopup({ kind: "project", id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "project failed");
    } finally {
      setBusy(false);
    }
  }

  async function openReview(id: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ review: ReviewFull }>(`/api/admin/reviews/${id}`);
      setReview(data.review);
      setPopup({ kind: "review", id });
      setAiFix("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "review failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProject() {
    if (!projectDraft) return;
    setBusy(true);
    setBusyLabel("Сохранение проекта…");
    try {
      const caps = projectDraft.betCaptionTemplates;
      const body: Record<string, unknown> = { ...projectDraft };
      if (!caps || caps.some((c) => !c?.trim())) {
        delete body.betCaptionTemplates;
      }
      if (!projectDraft.conditionsTexts?.length) {
        delete body.conditionsTexts;
      }
      // Drop null media paths so optional fields clear cleanly
      for (const key of [
        "wallpaperPath",
        "clientAvatarPath",
        "managerAvatarPath",
        "conditionsImagePath",
        "telegramThemeId",
      ] as const) {
        if (body[key] == null || body[key] === "") body[key] = undefined;
      }
      await api(`/api/admin/projects/${projectDraft.id}`, {
        method: "PATCH",
        json: body,
      });
      setMsg("Проект сохранён");
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function trialGenerate(
    projectId: string,
    opts: { profitFinal?: number; amountPackId?: string } = {},
  ) {
    setBusy(true);
    setError(null);
    setMsg(null);
    setBusyLabel("Запуск генерации…");
    try {
      const res = await fetch("/api/pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          autoPublish: false,
          stream: true,
          ...(opts.profitFinal && opts.profitFinal > 0 ? { profitFinal: opts.profitFinal } : {}),
          ...(opts.amountPackId ? { amountPackId: opts.amountPackId } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let err = res.statusText;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) err = j.error;
        } catch {
          if (text) err = text.slice(0, 200);
        }
        throw new Error(err);
      }
      if (!res.body) throw new Error("Нет потока ответа от сервера");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let doneMsg = "Пробный отзыв создан";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.replace(/^data:\s?/, "");
          let data: {
            type?: string;
            label?: string;
            detail?: string;
            step?: number;
            total?: number;
            error?: string;
            reviewId?: string;
          };
          try {
            data = JSON.parse(raw) as typeof data;
          } catch {
            continue;
          }
          if (data.type === "progress") {
            const step =
              data.step != null && data.total != null ? `${data.step}/${data.total} ` : "";
            const label = `${step}${data.label ?? "…"}${data.detail ? ` — ${data.detail}` : ""}`;
            setBusyLabel(label);
            setMsg(label);
          } else if (data.type === "error") {
            throw new Error(data.error ?? "Ошибка генерации");
          } else if (data.type === "done") {
            doneMsg = data.reviewId
              ? `Пробный отзыв готов (${data.reviewId.slice(0, 8)}…)`
              : "Пробный отзыв готов";
          }
        }
      }
      setMsg(doneMsg);
      setProjectFilter(projectId);
      setTab("reviews");
      setPopup(null);
      await loadReviews();
    } catch (e) {
      setError(e instanceof Error ? e.message : "generate failed");
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function reviewAction(action: string, extra: Record<string, unknown> = {}) {
    if (!review) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const data = await api<{ message?: string; review?: ReviewFull; screenshots?: string[] }>(
        `/api/admin/reviews/${review.id}`,
        { method: "POST", json: { action, useAi, ...extra } },
      );
      setMsg(data.message ?? `${action} OK`);
      if (data.review) setReview(data.review);
      else {
        const fresh = await api<{ review: ReviewFull }>(`/api/admin/reviews/${review.id}`);
        setReview(fresh.review);
      }
      await loadReviews();
    } catch (e) {
      setError(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDialog() {
    if (!review?.dialog) return;
    setBusy(true);
    try {
      await api(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        json: { dialog: review.dialog },
      });
      setMsg("Диалог сохранён");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save dialog failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAi() {
    if (!aiSettings) return;
    setBusy(true);
    setBusyLabel("Сохранение настроек ИИ…");
    try {
      const body: Record<string, unknown> = {
        OPENAI_MODEL: aiSettings.OPENAI_MODEL,
        OPENAI_IMAGE_MODEL: aiSettings.OPENAI_IMAGE_MODEL,
        OPENAI_RECEIPT_IMAGE_MODEL: aiSettings.OPENAI_RECEIPT_IMAGE_MODEL,
        AI_DIALOG: aiSettings.AI_DIALOG,
        AI_CLIENT_PHOTOS: aiSettings.AI_CLIENT_PHOTOS,
        AI_RECEIPTS: aiSettings.AI_RECEIPTS,
        AI_MEDIA: aiSettings.AI_MEDIA,
      };
      if (clearApiKey) body.OPENAI_API_KEY = "";
      else if (apiKeyDraft.trim()) body.OPENAI_API_KEY = apiKeyDraft.trim();

      await api("/api/admin/settings/ai", { method: "PUT", json: body });
      await api("/api/admin/settings/proxy", { method: "PUT", json: { PROXY_URL: proxyUrl } });
      setMsg("Настройки ИИ сохранены");
      await loadAi();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ai save failed");
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function saveSchedulePatch(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api("/api/admin/schedule", { method: "PATCH", json: patch });
      setMsg("Расписание обновлено");
      await loadSchedule();
    } catch (e) {
      setError(e instanceof Error ? e.message : "schedule failed");
    } finally {
      setBusy(false);
    }
  }

  async function importLibrary() {
    setBusy(true);
    try {
      const r = await api<{ message?: string; imported?: number }>("/api/admin/media/folders", {
        method: "POST",
        json: { action: "import-typed" },
      });
      setMsg(r.message ?? `Импорт: ${r.imported ?? 0}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(false);
    }
  }

  const screenUrls = useMemo(
    () =>
      (review?.screenshots ?? []).map((s) =>
        s.startsWith("http") || s.startsWith("/") ? s : mediaFileUrl(s),
      ),
    [review?.screenshots],
  );

  const projectRows = useMemo(
    () =>
      projects.map((p) => {
        const packs = allPacks.filter((a) => a.projectId === p.id);
        const finals = packs.map((a) => a.profitFinal);
        let profit = "—";
        if (finals.length) {
          const min = Math.min(...finals);
          const max = Math.max(...finals);
          profit =
            min === max
              ? `${min.toLocaleString()} ${p.currency}`
              : `${min.toLocaleString()}–${max.toLocaleString()} ${p.currency}`;
        }
        return {
          _id: p.id,
          name: p.name,
          id: p.id,
          locale: `${p.locale} / ${p.currency}`,
          manager: p.managerName,
          profit,
          packs: String(packs.length),
          twoPhase: p.twoPhaseReview ? "да" : "—",
        };
      }),
    [projects, allPacks],
  );

  const reviewRows = useMemo(
    () =>
      reviews.map((r) => ({
        _id: r.id,
        client: r.clientName,
        phase: r.phase,
        created: r.createdAt?.slice(0, 19)?.replace("T", " "),
        shots: String(r.screenshots?.length ?? 0),
      })),
    [reviews],
  );

  return (
    <>
      <h1>Рабочий стол</h1>
      <p className="sub">Таблицы проектов, отзывов, медиа, расписания и настроек. Клик по строке — попап.</p>
      {error ? <div className="err">{error}</div> : null}
      {msg ? <div className="okbox">{msg}</div> : null}
      {busy && busyLabel ? <div className="busybox">{busyLabel}</div> : null}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projects" ? (
        <DataTable
          columns={[
            { key: "name", label: "Проект" },
            { key: "id", label: "ID" },
            { key: "locale", label: "Локаль" },
            { key: "manager", label: "Менеджер" },
            { key: "profit", label: "Заработок (итог)" },
            { key: "packs", label: "Паки" },
            { key: "twoPhase", label: "2 фазы" },
          ]}
          rows={projectRows}
          onRowClick={(id) => void openProject(id)}
        />
      ) : null}

      {tab === "reviews" ? (
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => void loadReviews()} disabled={busy}>
              Обновить
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !projectFilter}
              onClick={() => void trialGenerate(projectFilter)}
            >
              Пробный отзыв
            </button>
          </div>
          <DataTable
            columns={[
              { key: "client", label: "Клиент" },
              { key: "phase", label: "Фаза" },
              { key: "created", label: "Создан" },
              { key: "shots", label: "Скрины" },
            ]}
            rows={reviewRows}
            onRowClick={(id) => void openReview(id)}
            empty="Нет отзывов для проекта"
          />
        </div>
      ) : null}

      {tab === "media" ? (
        <div className="section">
          <p className="muted">
            Общее хранилище <code>_shared</code>: папки вида <code>bets/okx</code>,{" "}
            <code>receipts/…</code>. Потом в проекте (вкладка Медиа в попапе) отметь, какие папки
            ставок ему брать.
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void importLibrary()}>
              Импорт старых каст → _shared/bets/…
            </button>
          </div>
          <FolderPicker value={null} onChange={() => undefined} allowShared manage />
        </div>
      ) : null}

      {tab === "schedule" && schedule ? (
        <div className="card">
          <pre className="logs" style={{ maxHeight: 360 }}>
            {JSON.stringify(schedule, null, 2)}
          </pre>
          <div className="field">
            <label>betReuseDays</label>
            <input
              type="number"
              defaultValue={Number(
                (schedule as { schedule?: { betReuseDays?: number } }).schedule?.betReuseDays ??
                  (schedule as { betReuseDays?: number }).betReuseDays ??
                  7,
              )}
              id="betReuseDays"
            />
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              const el = document.getElementById("betReuseDays") as HTMLInputElement | null;
              void saveSchedulePatch({ betReuseDays: Number(el?.value || 7) });
            }}
          >
            Сохранить cooldown ставок
          </button>
        </div>
      ) : null}

      {tab === "legends" ? (
        <DataTable
          columns={[
            { key: "title", label: "Название" },
            { key: "id", label: "ID" },
            { key: "locale", label: "Локаль" },
          ]}
          rows={legends.map((l) => ({
            _id: String(l.id),
            title: String(l.title ?? l.id),
            id: String(l.id),
            locale: String(l.locale ?? ""),
          }))}
          onRowClick={(id) => setPopup({ kind: "legend", id })}
        />
      ) : null}

      {tab === "ai" && !aiSettings ? (
        <div className="card muted">Загрузка настроек ИИ…</div>
      ) : null}

      {tab === "ai" && aiSettings ? (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Ключ OpenAI и режимы ИИ. Чеки и ставки правятся через{" "}
            <code>images.edit</code> с исходного фото (режим «Чеки/ставки»).
          </p>
          <div className="field">
            <label>Статус ключа</label>
            <div className="muted">
              {aiSettings.hasApiKey
                ? aiSettings.apiKeySource === "settings"
                  ? `Сохранён в настройках${aiSettings.apiKeyHint ? ` (${aiSettings.apiKeyHint})` : ""}`
                  : `Из .env${aiSettings.apiKeyHint ? ` (${aiSettings.apiKeyHint})` : ""}`
                : "Не задан — вставьте ниже и сохраните"}
            </div>
          </div>
          <div className="field">
            <label>OPENAI_API_KEY</label>
            <input
              type="password"
              autoComplete="off"
              placeholder={aiSettings.hasApiKey ? "•••• оставьте пустым чтобы не менять" : "sk-…"}
              value={apiKeyDraft}
              onChange={(e) => {
                setApiKeyDraft(e.target.value);
                setClearApiKey(false);
              }}
            />
          </div>
          <label className="row" style={{ marginBottom: 12, gap: 8 }}>
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(e) => {
                setClearApiKey(e.target.checked);
                if (e.target.checked) setApiKeyDraft("");
              }}
            />
            <span className="muted">Сбросить сохранённый ключ (вернуться к .env)</span>
          </label>
          {(
            [
              ["AI_DIALOG", "Диалоги", ["on", "off"]],
              ["AI_CLIENT_PHOTOS", "Фото клиента", ["off", "fallback", "always"]],
              ["AI_RECEIPTS", "Чеки / ставки (edit)", ["off", "fallback", "always"]],
              ["AI_MEDIA", "Прочее медиа", ["off", "fallback", "always"]],
            ] as const
          ).map(([key, label, opts]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <select
                value={String(aiSettings[key] ?? opts[0])}
                onChange={(e) => setAiSettings({ ...aiSettings, [key]: e.target.value })}
              >
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {(
            [
              ["OPENAI_MODEL", "Модель чата"],
              ["OPENAI_IMAGE_MODEL", "Модель картинок"],
              ["OPENAI_RECEIPT_IMAGE_MODEL", "Модель чеков/ставок"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                value={String(aiSettings[key] ?? "")}
                onChange={(e) => setAiSettings({ ...aiSettings, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="field">
            <label>PROXY_URL (опционально)</label>
            <input
              value={proxyUrl}
              placeholder="http://127.0.0.1:7890"
              onChange={(e) => setProxyUrl(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void saveAi()}>
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                setAiSettings({
                  ...aiSettings,
                  AI_DIALOG: "off",
                  AI_CLIENT_PHOTOS: "off",
                  AI_RECEIPTS: "off",
                  AI_MEDIA: "off",
                })
              }
            >
              Test mode (всё off)
            </button>
          </div>
        </div>
      ) : null}

      {tab === "bets" ? (
        <div className="card">
          <p className="muted">
            Общие папки ставок (<code>_shared/bets/okx</code> и т.п.). Назначение проекту — в
            попапе проекта → Медиа. Cooldown — Расписание.
          </p>
          <FolderPicker value={null} onChange={() => undefined} allowShared manage />
        </div>
      ) : null}

      {popup?.kind === "project" && projectDraft ? (
        <RowPopup
          title={projectDraft.name}
          subtitle={`${projectDraft.id} · клик по вкладкам: медиа, тексты, суммы`}
          onClose={() => setPopup(null)}
        >
          <ProjectEditor
            draft={projectDraft}
            onChange={setProjectDraft}
            busy={busy}
            onSave={() => void saveProject()}
            onTrial={(opts) => void trialGenerate(projectDraft.id, opts)}
          />
        </RowPopup>
      ) : null}

      {popup?.kind === "review" && review ? (
        <RowPopup title={`Отзыв ${review.clientName}`} subtitle={review.id} onClose={() => setPopup(null)}>
          <div className="toolbar">
            <label className="check-label">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              С ИИ
            </label>
            <div className="field field-inline">
              <label>Сумма для слота</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="например 2000"
                value={slotAmount}
                onChange={(e) => setSlotAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <h3>Скрины ({screenUrls.length})</h3>
              <button
                type="button"
                className="btn"
                disabled={busy || screenUrls.length === 0}
                onClick={() => void reviewAction("rerender")}
              >
                Пересобрать все
              </button>
            </div>
            {screenUrls.length === 0 ? (
              <p className="muted">Нет скриншотов</p>
            ) : (
              <div className="thumbs">
                {screenUrls.map((url, i) => (
                  <button
                    type="button"
                    key={`${url}-${i}`}
                    className="thumb-card"
                    title="Открыть"
                    onClick={() => setLightbox({ urls: screenUrls, index: i })}
                  >
                    <img src={url} alt={`Скрин ${i + 1}`} />
                    <span className="thumb-label">{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <h3>Слоты медиа</h3>
            <div className="slot-list">
              {SLOTS.map((slot) => (
                <details key={slot} className="slot-card">
                  <summary>
                    <strong>{slot}</strong>
                    <span className="muted path-ellip">{review.renderMedia?.[slot] ?? "не задан"}</span>
                  </summary>
                  <FolderPicker
                    projectId={review.projectId}
                    value={review.renderMedia?.[slot] ?? null}
                    onChange={(path) => {
                      setReview({
                        ...review,
                        renderMedia: { ...(review.renderMedia ?? {}), [slot]: path },
                      });
                    }}
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() =>
                        void reviewAction("replaceMedia", {
                          slot,
                          path: review.renderMedia?.[slot] ?? undefined,
                          generate: !review.renderMedia?.[slot],
                          rerender: true,
                          ...(slotAmount ? { amount: Number(slotAmount.replace(",", ".")) } : {}),
                        })
                      }
                    >
                      {review.renderMedia?.[slot] ? "Поставить файл" : "Сгенерировать"}
                    </button>
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="section">
            <h3>Сообщения</h3>
            {(review.dialog?.messages ?? []).map((m, idx) => (
              <div className="field" key={m.id ?? idx}>
                <label>
                  [{m.type}] {m.role ?? ""}
                </label>
                {m.type === "text" ? (
                  <textarea
                    value={m.content ?? ""}
                    onChange={(e) => {
                      const messages = [...(review.dialog?.messages ?? [])];
                      messages[idx] = { ...m, content: e.target.value };
                      setReview({
                        ...review,
                        dialog: { ...(review.dialog as ReviewFull["dialog"]), messages },
                      });
                    }}
                  />
                ) : (
                  <span className="muted">медиа-сообщение</span>
                )}
              </div>
            ))}
            <button type="button" className="btn" disabled={busy} onClick={() => void saveDialog()}>
              Сохранить тексты
            </button>
          </div>

          <div className="section">
            <h3>Что не так (для ИИ)</h3>
            <textarea
              value={aiFix}
              onChange={(e) => setAiFix(e.target.value)}
              placeholder="Например: на чеке сумма должна быть 2000, дата сегодня…"
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !aiFix.trim()}
                onClick={() =>
                  void reviewAction("aiFix", {
                    target: "dialog",
                    instruction: aiFix.trim(),
                    useAi: true,
                    rerender: true,
                  })
                }
              >
                Исправить через ИИ
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void reviewAction("translate")}
              >
                Перевод RU
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void reviewAction("rerender")}
              >
                Rerender
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={busy}
                onClick={() => void reviewAction("publish")}
              >
                Publish
              </button>
            </div>
          </div>
        </RowPopup>
      ) : null}

      {lightbox ? (
        <Lightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) => setLightbox({ urls: lightbox.urls, index: i })}
        />
      ) : null}

      {popup?.kind === "legend" ? (
        <RowPopup
          title="История"
          subtitle={popup.id}
          onClose={() => setPopup(null)}
        >
          <pre className="logs">
            {JSON.stringify(
              legends.find((l) => String(l.id) === popup.id) ?? {},
              null,
              2,
            )}
          </pre>
          <p className="muted">Полный CRUD легенд — через JSON выше / старый admin при необходимости.</p>
        </RowPopup>
      ) : null}
    </>
  );
}
