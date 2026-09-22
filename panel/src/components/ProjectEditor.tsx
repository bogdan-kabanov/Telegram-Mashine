import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { FolderPicker } from "./FolderPicker";

export type ProjectDraft = {
  id: string;
  name: string;
  locale: string;
  currency: string;
  managerName: string;
  managerHandle: string;
  managerAvatarPath?: string | null;
  clientAvatarPath?: string | null;
  wallpaperPath?: string | null;
  conditionsImagePath?: string | null;
  conditionsTexts?: string[];
  betCaptionTemplates?: [string, string, string];
  depositMessageTemplate?: string;
  completionMessageTemplate?: string;
  payoutMessageTemplate?: string;
  twoPhaseReview?: boolean;
  phaseDelayMinutes?: number;
  telegramThemeId?: string;
  mediaFolders?: {
    bets?: string[];
    receipts?: string[];
    conditions?: string[];
  };
  theme?: {
    incomingBubble: string;
    outgoingBubble: string;
    accentColor: string;
    headerBg?: string;
    statusBarStyle?: "light" | "dark";
  };
};

export type AmountPackRow = {
  id: string;
  projectId?: string;
  betPack?: number;
  deposit: number;
  profit1: number;
  profit2: number;
  profitFinal: number;
  currency: string;
};

type LocaleRow = { code: string; currency: string; name?: string };

export function ProjectEditor({
  draft,
  onChange,
  busy,
  onSave,
  onTrial,
}: {
  draft: ProjectDraft;
  onChange: (next: ProjectDraft) => void;
  busy: boolean;
  onSave: () => void;
  onTrial: (opts: { profitFinal?: number; amountPackId?: string }) => void;
}) {
  const [section, setSection] = useState<"main" | "media" | "texts" | "amounts" | "theme">(
    "main",
  );
  const [packs, setPacks] = useState<AmountPackRow[]>([]);
  const [locales, setLocales] = useState<LocaleRow[]>([]);
  const [betFolders, setBetFolders] = useState<string[]>([]);
  const [packError, setPackError] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [editPack, setEditPack] = useState<AmountPackRow | null>(null);
  const [trialProfit, setTrialProfit] = useState("");
  const [trialPackId, setTrialPackId] = useState("");

  const loadPacks = async () => {
    const data = await api<{ packs: AmountPackRow[] }>(
      `/api/admin/amounts?projectId=${encodeURIComponent(draft.id)}`,
    );
    setPacks(data.packs ?? []);
  };

  useEffect(() => {
    void loadPacks().catch((e) => setPackError(e instanceof Error ? e.message : "packs failed"));
    void api<{ locales?: LocaleRow[]; items?: LocaleRow[] }>("/api/admin/locales")
      .then((d) => setLocales(d.locales ?? d.items ?? []))
      .catch(() => setLocales([]));
    void api<{ folders: Array<{ scope: string; name: string; kind?: string }> }>(
      "/api/admin/media/folders?shared=1",
    )
      .then((d) => {
        const bets = (d.folders ?? [])
          .filter((f) => f.scope === "_shared" && (f.kind === "bets" || f.name.startsWith("bets/")))
          .map((f) => f.name);
        setBetFolders(bets);
      })
      .catch(() => setBetFolders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  const profitSummary = useMemo(() => {
    if (!packs.length) return "—";
    const vals = packs.map((p) => p.profitFinal);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return `${min.toLocaleString()} ${draft.currency}`;
    return `${min.toLocaleString()}–${max.toLocaleString()} ${draft.currency}`;
  }, [packs, draft.currency]);

  function setField<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  async function savePack() {
    if (!editPack) return;
    setPackBusy(true);
    setPackError(null);
    try {
      const body = {
        ...editPack,
        projectId: draft.id,
        currency: draft.currency,
        deposit: Number(editPack.deposit),
        profit1: Number(editPack.profit1),
        profit2: Number(editPack.profit2),
        profitFinal: Number(editPack.profitFinal),
        betPack: editPack.betPack ? Number(editPack.betPack) : undefined,
      };
      await api("/api/admin/amounts", { method: "PUT", json: body });
      setEditPack(null);
      await loadPacks();
    } catch (e) {
      setPackError(e instanceof Error ? e.message : "save pack failed");
    } finally {
      setPackBusy(false);
    }
  }

  async function removePack(id: string) {
    if (!window.confirm(`Удалить пак ${id}?`)) return;
    setPackBusy(true);
    try {
      await api(`/api/admin/amounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadPacks();
    } catch (e) {
      setPackError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setPackBusy(false);
    }
  }

  async function generateFromMedia() {
    const profitFinal = Number(trialProfit);
    if (!Number.isFinite(profitFinal) || profitFinal <= 0) {
      setPackError("Укажите итоговый заработок, например 100000");
      return;
    }
    if (
      !window.confirm(
        `Собрать паки сумм из медиа-ставок проекта и разложить прибыль около ${profitFinal.toLocaleString()} ${draft.currency}? Старые паки этого проекта будут заменены.`,
      )
    ) {
      return;
    }
    setPackBusy(true);
    setPackError(null);
    try {
      const data = await api<{
        packs: AmountPackRow[];
        message?: string;
        generated?: number;
      }>("/api/admin/amounts", {
        method: "PUT",
        json: {
          action: "generate-from-media",
          projectId: draft.id,
          profitFinal,
        },
      });
      setPacks(data.packs ?? []);
      setEditPack(null);
    } catch (e) {
      setPackError(e instanceof Error ? e.message : "generate failed");
    } finally {
      setPackBusy(false);
    }
  }

  function newPack() {
    const n = packs.length + 1;
    setEditPack({
      id: `${draft.id}_${String(n).padStart(2, "0")}`,
      projectId: draft.id,
      betPack: n,
      deposit: 650,
      profit1: 15000,
      profit2: 35000,
      profitFinal: 75000,
      currency: draft.currency,
    });
  }

  const caps = draft.betCaptionTemplates ?? ["", "", ""];

  return (
    <div className="project-editor">
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["main", "Основное"],
            ["media", "Медиа"],
            ["texts", "Тексты"],
            ["amounts", "Суммы / ставки"],
            ["theme", "Тема"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab${section === id ? " active" : ""}`}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "main" ? (
        <>
          <div className="field">
            <label>Имя проекта</label>
            <input value={draft.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="field">
            <label>Локаль (валюта подтянется сама)</label>
            <select
              value={draft.locale}
              onChange={(e) => setField("locale", e.target.value)}
            >
              {locales.length === 0 ? (
                <option value={draft.locale}>{draft.locale}</option>
              ) : (
                locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name ?? l.code} / {l.currency}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="field">
            <label>Менеджер</label>
            <input
              value={draft.managerName}
              onChange={(e) => setField("managerName", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Handle</label>
            <input
              value={draft.managerHandle}
              onChange={(e) => setField("managerHandle", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Telegram theme id</label>
            <input
              value={draft.telegramThemeId ?? ""}
              onChange={(e) => setField("telegramThemeId", e.target.value || undefined)}
            />
          </div>
          <label className="row" style={{ marginBottom: 12, gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(draft.twoPhaseReview)}
              onChange={(e) => setField("twoPhaseReview", e.target.checked)}
            />
            <span>Две фазы отзыва</span>
          </label>
          {draft.twoPhaseReview ? (
            <div className="field">
              <label>Пауза между фазами (мин)</label>
              <input
                type="number"
                value={draft.phaseDelayMinutes ?? 60}
                onChange={(e) => setField("phaseDelayMinutes", Number(e.target.value) || undefined)}
              />
            </div>
          ) : null}
          <p className="muted">Итоговый заработок по пакам: {profitSummary}</p>
        </>
      ) : null}

      {section === "media" ? (
        <>
          <div className="card" style={{ marginBottom: 14, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Папки ставок (общее хранилище)</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Медиа лежит в <code>_shared/bets/…</code> (например <code>bets/okx</code>). Отметь,
              какие папки использует этот проект. Создать/залить фото — вкладка Медиа.
            </p>
            {betFolders.length === 0 ? (
              <p className="muted">
                Пока нет папок bets/* — в Медиа создай <code>bets/okx</code> или нажми «Импорт
                старых каст».
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {betFolders.map((name) => {
                  const selected = draft.mediaFolders?.bets?.includes(name) ?? false;
                  return (
                    <label key={name} className="row" style={{ gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const cur = new Set(draft.mediaFolders?.bets ?? []);
                          if (e.target.checked) cur.add(name);
                          else cur.delete(name);
                          setField("mediaFolders", {
                            ...draft.mediaFolders,
                            bets: [...cur],
                          });
                        }}
                      />
                      <span>
                        <code>{name}</code>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {(draft.mediaFolders?.bets?.length ?? 0) > 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Выбрано: {(draft.mediaFolders?.bets ?? []).join(", ")}
              </p>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                Не выбрано — будет старый путь library/{"{"}project{"}"}/bets (если есть).
              </p>
            )}
          </div>

          <div className="field">
            <label>Обои чата</label>
            <FolderPicker
              projectId={draft.id}
              value={draft.wallpaperPath ?? null}
              onChange={(path) => setField("wallpaperPath", path)}
            />
          </div>
          <div className="field">
            <label>Аватар клиента</label>
            <FolderPicker
              projectId={draft.id}
              value={draft.clientAvatarPath ?? null}
              onChange={(path) => setField("clientAvatarPath", path)}
            />
          </div>
          <div className="field">
            <label>Аватар менеджера</label>
            <FolderPicker
              projectId={draft.id}
              value={draft.managerAvatarPath ?? null}
              onChange={(path) => setField("managerAvatarPath", path)}
            />
          </div>
          <div className="field">
            <label>Картинка условий</label>
            <FolderPicker
              projectId={draft.id}
              value={draft.conditionsImagePath ?? null}
              onChange={(path) => setField("conditionsImagePath", path)}
            />
          </div>
        </>
      ) : null}

      {section === "texts" ? (
        <>
          <div className="field">
            <label>Шаблон депозита</label>
            <textarea
              value={draft.depositMessageTemplate ?? ""}
              onChange={(e) => setField("depositMessageTemplate", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Шаблон завершения</label>
            <textarea
              value={draft.completionMessageTemplate ?? ""}
              onChange={(e) => setField("completionMessageTemplate", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Шаблон выплаты</label>
            <textarea
              value={draft.payoutMessageTemplate ?? ""}
              onChange={(e) => setField("payoutMessageTemplate", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Тексты условий (по строке)</label>
            <textarea
              value={(draft.conditionsTexts ?? []).join("\n")}
              onChange={(e) =>
                setField(
                  "conditionsTexts",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          {[0, 1, 2].map((i) => (
            <div className="field" key={i}>
              <label>Подпись ставки {i + 1}</label>
              <textarea
                value={caps[i] ?? ""}
                onChange={(e) => {
                  const next: [string, string, string] = [
                    caps[0] ?? "",
                    caps[1] ?? "",
                    caps[2] ?? "",
                  ];
                  next[i] = e.target.value;
                  setField("betCaptionTemplates", next);
                }}
              />
            </div>
          ))}
        </>
      ) : null}

      {section === "amounts" ? (
        <>
          <div className="card" style={{ marginBottom: 14, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Итоговый заработок → паки из медиа</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Укажи, сколько клиент заработает за отзыв (например 100000). Система возьмёт все
              полные паки ставок из медиа (pack01_1/2/3 …) и сама разложит депозит + прибыли по
              трём скринам — около этой суммы, с лёгким разбросом.
            </p>
            <div className="field">
              <label>Итого заработает (profitFinal)</label>
              <input
                type="number"
                placeholder="100000"
                value={trialProfit}
                onChange={(e) => setTrialProfit(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={packBusy || !trialProfit || Number(trialProfit) <= 0}
              onClick={() => void generateFromMedia()}
            >
              Сгенерировать суммы по медиа-ставкам
            </button>
          </div>

          <p className="muted">
            Таблица ниже — результат. Клик по строке — ручная правка одного пака.
          </p>
          {packError ? <div className="err">{packError}</div> : null}
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Пак</th>
                  <th>Депозит</th>
                  <th>P1</th>
                  <th>P2</th>
                  <th>Итого</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id} onClick={() => setEditPack({ ...p })}>
                    <td>{p.id}</td>
                    <td>{p.betPack ?? "—"}</td>
                    <td>{p.deposit}</td>
                    <td>{p.profit1}</td>
                    <td>{p.profit2}</td>
                    <td>
                      <b>{p.profitFinal}</b>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm danger"
                        disabled={packBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void removePack(p.id);
                        }}
                      >
                        Удал.
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn" disabled={packBusy} onClick={newPack}>
            + пак сумм вручную
          </button>

          {editPack ? (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Пак {editPack.id}</h3>
              <div className="field">
                <label>ID</label>
                <input
                  value={editPack.id}
                  onChange={(e) => setEditPack({ ...editPack, id: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Номер пака ставок (betPack)</label>
                <input
                  type="number"
                  value={editPack.betPack ?? ""}
                  onChange={(e) =>
                    setEditPack({
                      ...editPack,
                      betPack: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Депозит</label>
                <input
                  type="number"
                  value={editPack.deposit}
                  onChange={(e) => setEditPack({ ...editPack, deposit: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Прибыль ставка 1</label>
                <input
                  type="number"
                  value={editPack.profit1}
                  onChange={(e) => setEditPack({ ...editPack, profit1: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Прибыль ставка 2</label>
                <input
                  type="number"
                  value={editPack.profit2}
                  onChange={(e) => setEditPack({ ...editPack, profit2: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Итого заработает (profitFinal)</label>
                <input
                  type="number"
                  value={editPack.profitFinal}
                  onChange={(e) =>
                    setEditPack({ ...editPack, profitFinal: Number(e.target.value) })
                  }
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn primary"
                  disabled={packBusy}
                  onClick={() => void savePack()}
                >
                  Сохранить пак
                </button>
                <button type="button" className="btn" onClick={() => setEditPack(null)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : null}

          <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--line)" }} />
          <h3>Пробный отзыв</h3>
          <div className="field">
            <label>Пак (или случайный по циклу)</label>
            <select value={trialPackId} onChange={(e) => setTrialPackId(e.target.value)}>
              <option value="">случайный / по циклу</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} → {p.profitFinal} {p.currency}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              onTrial({
                ...(trialPackId ? { amountPackId: trialPackId } : {}),
                ...(trialProfit && !trialPackId ? { profitFinal: Number(trialProfit) } : {}),
              })
            }
          >
            Пробный отзыв
          </button>
        </>
      ) : null}

      {section === "theme" && draft.theme ? (
        <>
          {(
            [
              ["incomingBubble", "Входящий пузырь"],
              ["outgoingBubble", "Исходящий пузырь"],
              ["accentColor", "Акцент"],
              ["headerBg", "Шапка"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="color"
                value={draft.theme?.[key] ?? "#ffffff"}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    theme: { ...draft.theme!, [key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn primary" disabled={busy} onClick={onSave}>
          Сохранить проект
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onTrial({})}
        >
          Пробный отзыв
        </button>
      </div>
    </div>
  );
}
