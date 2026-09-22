import { useCallback, useEffect, useState } from "react";
import { api, mediaFileUrl } from "../api/client";
import { Lightbox } from "./Lightbox";

type FolderFile = {
  name: string;
  path: string;
  size: number;
};

type FolderInfo = {
  scope: string;
  name: string;
  path: string;
  files: FolderFile[];
};

export function FolderPicker({
  projectId,
  value,
  onChange,
  allowShared = true,
  manage = false,
}: {
  projectId?: string;
  value?: string | null;
  onChange: (path: string | null) => void;
  allowShared?: boolean;
  /** Show delete / open controls (media library tab). */
  manage?: boolean;
}) {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [folder, setFolder] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams();
      if (projectId) q.set("projectId", projectId);
      if (allowShared) q.set("shared", "1");
      const data = await api<{ folders: FolderInfo[] }>(
        `/api/admin/media/folders?${q.toString()}`,
      );
      setFolders(data.folders ?? []);
      setFolder((prev) => {
        if (prev && data.folders?.some((f) => `${f.scope}/${f.name}` === prev)) return prev;
        if (data.folders?.[0]) return `${data.folders[0].scope}/${data.folders[0].name}`;
        return "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки папок");
    }
  }, [projectId, allowShared]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = folders.find((f) => `${f.scope}/${f.name}` === folder);
  const files = current?.files ?? [];
  const previewUrls = files.map((f) => mediaFileUrl(f.path));

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length || !current) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("scope", current.scope);
      fd.set("folder", current.name);
      fd.set("file", fileList[0]!);
      const res = await fetch("/api/admin/media/folders", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const name = window.prompt(
      "Путь папки в общем хранилище\nПример: bets/okx  или  receipts/banorte",
      "bets/okx",
    );
    if (!name?.trim()) return;
    const scope = "_shared";
    setBusy(true);
    try {
      await api("/api/admin/media/folders", {
        method: "POST",
        json: { action: "mkdir", scope, folder: name.trim() },
      });
      await load();
      setFolder(`${scope}/${name.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "mkdir failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(file: FolderFile) {
    if (!window.confirm(`Удалить файл?\n${file.name}`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/media/folders", {
        method: "POST",
        json: { action: "delete-file", path: file.path },
      });
      if (value === file.path) onChange(null);
      setPreview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder() {
    if (!current) return;
    if (
      !window.confirm(
        `Удалить папку «${current.scope}/${current.name}» и все ${current.files.length} файлов?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/media/folders", {
        method: "POST",
        json: { action: "delete-folder", scope: current.scope, folder: current.name },
      });
      setFolder("");
      setPreview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete folder failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? <div className="err">{error}</div> : null}
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={folder} onChange={(e) => setFolder(e.target.value)}>
          {folders.map((f) => (
            <option key={`${f.scope}/${f.name}`} value={`${f.scope}/${f.name}`}>
              {f.scope}/{f.name} ({f.files.length})
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => void createFolder()} disabled={busy}>
          + папка
        </button>
        <label className="btn" style={{ cursor: "pointer" }}>
          Загрузить
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            disabled={busy || !current}
            onChange={(e) => void onUpload(e.target.files)}
          />
        </label>
        {manage && current ? (
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => void deleteFolder()}
          >
            Удалить папку
          </button>
        ) : null}
        {value ? (
          <button type="button" className="btn" onClick={() => onChange(null)}>
            Сбросить
          </button>
        ) : null}
      </div>
      <div className="folder-grid">
        {files.map((f, i) => (
          <div
            key={f.path}
            className={`folder-item${value === f.path ? " selected" : ""}`}
          >
            <button
              type="button"
              className="folder-thumb"
              onClick={() => {
                if (manage) setPreview(i);
                else onChange(f.path);
              }}
              onDoubleClick={() => setPreview(i)}
              title={manage ? "Открыть" : "Выбрать"}
            >
              <img src={mediaFileUrl(f.path)} alt="" />
              <div className="folder-name">{f.name}</div>
            </button>
            <div className="folder-actions">
              {!manage ? (
                <button type="button" className="btn sm" onClick={() => onChange(f.path)}>
                  Выбрать
                </button>
              ) : null}
              <button
                type="button"
                className="btn sm"
                onClick={() => setPreview(i)}
                title="Просмотр"
              >
                Откр.
              </button>
              <button
                type="button"
                className="btn sm danger"
                disabled={busy}
                onClick={() => void deleteFile(f)}
                title="Удалить"
              >
                Удал.
              </button>
            </div>
          </div>
        ))}
      </div>
      {preview != null && previewUrls.length > 0 ? (
        <Lightbox
          urls={previewUrls}
          index={preview}
          onClose={() => setPreview(null)}
          onIndex={setPreview}
        />
      ) : null}
    </div>
  );
}
