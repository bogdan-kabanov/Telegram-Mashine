import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

export type MediaFoldersSelection = {
  bets?: string[];
  receipts?: string[];
  conditions?: string[];
};

type FolderRow = {
  scope: string;
  name: string;
  kind?: string;
  files: unknown[];
};

type PackRow = {
  id: string;
  projectId?: string;
  profitFinal: number;
  currency: string;
};

const KIND_META: Array<{
  key: keyof MediaFoldersSelection;
  kind: string;
  title: string;
  hint: string;
}> = [
  {
    key: "bets",
    kind: "bets",
    title: "Ставки",
    hint: "Папки со скринами ставок (pack01_1/2/3 …)",
  },
  {
    key: "receipts",
    kind: "receipts",
    title: "Чеки",
    hint: "Пулы чеков / captura в общем хранилище",
  },
  {
    key: "conditions",
    kind: "conditions",
    title: "Условия",
    hint: "Картинки условий работы",
  },
];

export function TrialReviewPopup({
  projects,
  initialProjectId,
  initialFolders,
  busy,
  onClose,
  onConfirm,
}: {
  projects: Array<{ id: string; name: string; currency: string; mediaFolders?: MediaFoldersSelection }>;
  initialProjectId: string;
  initialFolders?: MediaFoldersSelection | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    projectId: string;
    mediaFolders: MediaFoldersSelection;
    amountPackId?: string;
    profitFinal?: number;
  }) => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [selected, setSelected] = useState<MediaFoldersSelection>(() => ({
    bets: initialFolders?.bets ?? [],
    receipts: initialFolders?.receipts ?? [],
    conditions: initialFolders?.conditions ?? [],
  }));
  const [packId, setPackId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    const fromProject = projects.find((p) => p.id === projectId)?.mediaFolders;
    setSelected({
      bets: fromProject?.bets ?? initialFolders?.bets ?? [],
      receipts: fromProject?.receipts ?? initialFolders?.receipts ?? [],
      conditions: fromProject?.conditions ?? initialFolders?.conditions ?? [],
    });
    setPackId("");
  }, [projectId, projects, initialFolders]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [folderData, packData] = await Promise.all([
          api<{ folders: FolderRow[] }>("/api/admin/media/folders?shared=1"),
          api<{ packs: PackRow[] }>(
            `/api/admin/amounts?projectId=${encodeURIComponent(projectId)}`,
          ),
        ]);
        if (cancelled) return;
        setFolders((folderData.folders ?? []).filter((f) => f.scope === "_shared"));
        setPacks(packData.packs ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить папки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const byKind = useMemo(() => {
    const map: Record<string, FolderRow[]> = { bets: [], receipts: [], conditions: [] };
    for (const f of folders) {
      const kind =
        f.kind ??
        (f.name.startsWith("bets/")
          ? "bets"
          : f.name.startsWith("receipts/")
            ? "receipts"
            : f.name.startsWith("conditions/")
              ? "conditions"
              : f.name.split("/")[0] ?? "");
      if (!map[kind]) map[kind] = [];
      map[kind]!.push(f);
    }
    return map;
  }, [folders]);

  function toggle(key: keyof MediaFoldersSelection, name: string, on: boolean) {
    setSelected((prev) => {
      const cur = new Set(prev[key] ?? []);
      if (on) cur.add(name);
      else cur.delete(name);
      return { ...prev, [key]: [...cur] };
    });
  }

  function submit() {
    const mediaFolders: MediaFoldersSelection = {};
    if (selected.bets?.length) mediaFolders.bets = selected.bets;
    if (selected.receipts?.length) mediaFolders.receipts = selected.receipts;
    if (selected.conditions?.length) mediaFolders.conditions = selected.conditions;
    onConfirm({
      projectId,
      mediaFolders,
      ...(packId ? { amountPackId: packId } : {}),
    });
  }

  return (
    <div className="overlay" onClick={onClose} data-tour="trial-popup">
      <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="drawer-head">
          <div>
            <h2>Создать отзыв</h2>
            <p className="sub drawer-sub">Выбери папки медиа для этого отзыва</p>
          </div>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
        </header>
        <div className="drawer-body">
          {error ? <div className="err">{error}</div> : null}
          {loading ? <p className="muted">Загрузка папок…</p> : null}

          <div className="field" data-tour="trial-project">
            <label>Проект</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          {KIND_META.map(({ key, kind, title, hint }) => {
            const list = byKind[kind] ?? [];
            return (
              <div
                key={key}
                className="card"
                style={{ marginBottom: 12, padding: 12 }}
                data-tour={`trial-${key}`}
              >
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h3>
                <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
                  {hint}
                </p>
                {list.length === 0 ? (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Нет папок <code>_shared/{kind}/…</code> — загрузи во вкладке Медиа.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {list.map((f) => {
                      const checked = selected[key]?.includes(f.name) ?? false;
                      return (
                        <label key={f.name} className="row" style={{ gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={(e) => toggle(key, f.name, e.target.checked)}
                          />
                          <span>
                            <code>{f.name}</code>{" "}
                            <span className="muted">({f.files.length})</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="field" data-tour="trial-pack">
            <label>Пак сумм (опционально)</label>
            <select value={packId} onChange={(e) => setPackId(e.target.value)} disabled={busy}>
              <option value="">случайный / по циклу</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} → {p.profitFinal} {p.currency || project?.currency}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ marginTop: 16 }} data-tour="trial-submit">
            <button
              type="button"
              className="btn primary"
              disabled={busy || loading || !projectId}
              onClick={submit}
            >
              {busy ? "Генерация…" : "Создать отзыв"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={onClose}>
              Отмена
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
