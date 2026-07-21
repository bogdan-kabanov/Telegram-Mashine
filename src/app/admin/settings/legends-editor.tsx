"use client";

import { useCallback, useEffect, useState } from "react";

import { colors, inputStyle, radius, styles } from "../styles";

interface Legend {
  id: string;
  title: string;
  locale: string;
  openingPhrase?: string;
  problem: string;
  motivation: string;
  photoAfterProblemIndex?: number;
  gratitudePhrases: string[];
  doubtPhrases: string[];
}

interface StoryPhoto {
  id: string;
  filename: string;
  url: string;
  legendId: string | null;
}

function emptyLegend(): Legend {
  return {
    id: `legend_${Date.now().toString(36)}`,
    title: "Новая легенда",
    locale: "es-MX",
    openingPhrase: "Necesito tu ayuda",
    problem: "Опишите проблему клиента одним-двумя предложениями",
    motivation: "Почему клиент хочет заработать / начать",
    photoAfterProblemIndex: 0,
    gratitudePhrases: ["Gracias", "Me has ayudado mucho"],
    doubtPhrases: ["No lo entiendo", "¿Seguro que saldrá bien?"],
  };
}

export function LegendsEditor() {
  const [legends, setLegends] = useState<Legend[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<StoryPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const field = inputStyle();

    const loadPhotos = useCallback(async () => {
    const res = await fetch("/api/admin/media");
    const data = (await res.json()) as {
      assets?: Array<{ id: string; filename: string; url: string; legendId: string | null; type: string }>;
    };
    setPhotos(
      (data.assets ?? [])
        .filter((a) => a.type === "story_photo")
        .map(({ id, filename, url, legendId }) => ({ id, filename, url, legendId })),
    );
  }, []);

  useEffect(() => {
    void Promise.all([
      fetch("/api/admin/legends")
        .then((r) => r.json())
        .then((d: { legends?: Legend[] }) => {
          setLegends(d.legends ?? []);
          setLoading(false);
        }),
      loadPhotos(),
    ]);
  }, [loadPhotos]);

  const current = legends[selected];
  const legendPhotos = photos.filter((p) => p.legendId === current?.id);

  async function save(next = legends) {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/legends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legends: next }),
      });
      const data = (await res.json()) as { error?: string; legends?: Legend[] };
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (data.legends) setLegends(data.legends);
      setMessage("Сохранено");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<Legend>) {
    setLegends((list) => list.map((l, i) => (i === selected ? { ...l, ...patch } : l)));
  }

  function addLegend() {
    const created = emptyLegend();
    const next = [...legends, created];
    setLegends(next);
    setSelected(next.length - 1);
    setMessage("Заполните поля и нажмите «Сохранить»");
  }

  async function removeLegend() {
    if (!current) return;
    if (legends.length <= 1) {
      setMessage("Нужна хотя бы одна легенда");
      return;
    }
    if (!confirm(`Удалить легенду «${current.title}»?`)) return;
    const next = legends.filter((_, i) => i !== selected);
    setLegends(next);
    setSelected(Math.max(0, selected - 1));
    await save(next);
  }

  async function uploadPhoto(file: File) {
    if (!current) return;
    setUploadingPhoto(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("type", "story_photo");
      form.set("legendId", current.id);
      form.set("file", file);
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setMessage(data.message ?? "Фото добавлено");
      await loadPhotos();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deletePhoto(id: string) {
    if (!confirm("Удалить это фото?")) return;
    await fetch(`/api/admin/media?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadPhotos();
  }

  if (loading) return <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>Загрузка…</p>;
  if (!current) {
    return (
      <div>
        <p style={{ color: colors.muted, fontSize: "0.875rem" }}>Легенд пока нет.</p>
        <button type="button" style={styles.button} onClick={addLegend}>
          Создать легенду
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {legends.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setSelected(i)}
            style={{
              textAlign: "left",
              padding: "0.55rem 0.65rem",
              borderRadius: radius.sm,
              border: `1px solid ${i === selected ? colors.accent : colors.border}`,
              background: i === selected ? colors.bg : colors.card,
              color: colors.text,
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            <div style={{ fontWeight: 500 }}>{l.title}</div>
            <div style={{ color: colors.muted, fontSize: "0.7rem", marginTop: 2 }}>{l.id}</div>
          </button>
        ))}
        <button type="button" style={{ ...styles.buttonSecondary, marginTop: "0.35rem" }} onClick={addLegend}>
          + Новая легенда
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <p style={{ margin: 0, color: colors.muted, fontSize: "0.8125rem", lineHeight: 1.45 }}>
          Легенда — история клиента. Фото из блока ниже попадают в диалог после фразы о проблеме.
          При генерации бот случайно выбирает одно фото этой легенды.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <Field label="ID (латиница, без пробелов)">
            <input
              style={field}
              value={current.id}
              onChange={(e) => update({ id: e.target.value.trim().replace(/\s+/g, "_") })}
            />
          </Field>
          <Field label="Локаль">
            <input style={field} value={current.locale} onChange={(e) => update({ locale: e.target.value })} />
          </Field>
        </div>

        <Field label="Название">
          <input style={field} value={current.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Первая фраза клиента">
          <input
            style={field}
            value={current.openingPhrase ?? ""}
            onChange={(e) => update({ openingPhrase: e.target.value })}
          />
        </Field>
        <Field label="Проблема (можно несколько предложений)">
          <textarea style={{ ...field, minHeight: 64 }} value={current.problem} onChange={(e) => update({ problem: e.target.value })} />
        </Field>
        <Field label="Мотивация">
          <textarea
            style={{ ...field, minHeight: 48 }}
            value={current.motivation}
            onChange={(e) => update({ motivation: e.target.value })}
          />
        </Field>
        <Field label="После какого предложения проблемы вставить фото (0 = первое)">
          <input
            type="number"
            min={0}
            style={field}
            value={current.photoAfterProblemIndex ?? 0}
            onChange={(e) => update({ photoAfterProblemIndex: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Фразы благодарности (каждая с новой строки)">
          <textarea
            style={{ ...field, minHeight: 72 }}
            value={current.gratitudePhrases.join("\n")}
            onChange={(e) => update({ gratitudePhrases: e.target.value.split("\n").filter(Boolean) })}
          />
        </Field>
        <Field label="Фразы сомнений (каждая с новой строки)">
          <textarea
            style={{ ...field, minHeight: 72 }}
            value={current.doubtPhrases.join("\n")}
            onChange={(e) => update({ doubtPhrases: e.target.value.split("\n").filter(Boolean) })}
          />
        </Field>

        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: "0.75rem",
            background: colors.bg,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: "0.35rem" }}>Фото этой легенды в диалоге</div>
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.75rem", color: colors.muted }}>
            Загрузите 1–5 фото «доказательства» проблемы (рука, документы и т.п.). Они хранятся в{" "}
            <code>story_photos/{current.id}/</code>.
          </p>

          {legendPhotos.length === 0 ? (
            <p style={{ margin: "0 0 0.65rem", fontSize: "0.8125rem", color: colors.muted }}>Пока нет фото</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem" }}>
              {legendPhotos.map((p) => (
                <div key={p.id} style={{ width: 88, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.filename}
                    style={{ width: 88, height: 88, objectFit: "cover", borderRadius: radius.sm, border: `1px solid ${colors.border}` }}
                  />
                  <button
                    type="button"
                    onClick={() => void deletePhoto(p.id)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      border: "none",
                      background: "rgba(0,0,0,0.55)",
                      color: "#fff",
                      fontSize: "0.65rem",
                      padding: "2px 5px",
                      borderRadius: radius.sm,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <label style={{ ...styles.buttonSecondary, display: "inline-block", cursor: "pointer" }}>
            {uploadingPhoto ? "Загрузка…" : "Добавить фото"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploadingPhoto}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={styles.button} onClick={() => void save()} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button type="button" style={{ ...styles.buttonSecondary, color: colors.danger }} onClick={() => void removeLegend()}>
            Удалить легенду
          </button>
          {message && (
            <span style={{ fontSize: "0.875rem", color: message === "Сохранено" || message.includes("Фото") ? colors.success : colors.danger }}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontSize: "0.75rem", color: colors.muted }}>{label}</span>
      {children}
    </label>
  );
}
