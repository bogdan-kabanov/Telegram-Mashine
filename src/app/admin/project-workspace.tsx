"use client";

import { useCallback, useEffect, useState } from "react";

import { ScreenshotGallery } from "./screenshot-gallery";
import { colors, inputStyle, radius, styles } from "./styles";

export interface ProjectWorkspaceProps {
  project: {
    id: string;
    name: string;
    locale: string;
    currency: string;
    managerHandle: string;
    managerName: string;
    twoPhaseReview: boolean;
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

type Tab = "preview" | "settings";

export function ProjectWorkspace({ project, initialReview }: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState(initialReview?.id ?? "");
  const [screenshots, setScreenshots] = useState<string[]>(initialReview?.screenshots ?? []);
  const [saving, setSaving] = useState(false);
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
    const res = await fetch(`/api/admin/reviews?projectId=${project.id}&limit=1`);
    const data = (await res.json()) as {
      reviews?: Array<{ id: string; screenshots: string[] }>;
    };
    const last = data.reviews?.[0];
    if (last) {
      setReviewId(last.id);
      setScreenshots(last.screenshots);
    }
  }, [project.id]);

  useEffect(() => {
    if (!initialReview && screenshots.length === 0) {
      void loadLastReview();
    }
  }, [initialReview, screenshots.length, loadLastReview]);

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
            statusBarStyle: "dark",
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

  const fieldInput = inputStyle();

  return (
    <div style={projectCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{project.name}</h2>
          <p style={{ color: colors.muted, margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
            {project.managerHandle} · {project.locale} · {project.currency}
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Генерация…" : "Сгенерировать"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.75rem", borderBottom: `1px solid ${colors.border}` }}>
        <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>
          Скриншоты
        </TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>
          Настройки
        </TabBtn>
      </div>

      {error && (
        <p style={{ color: colors.danger, fontSize: "0.875rem", margin: "0.5rem 0 0" }}>{error}</p>
      )}

      {tab === "preview" && (
        <div style={{ marginTop: "0.75rem" }}>
          {screenshots.length > 0 ? (
            <ScreenshotGallery screenshots={screenshots} reviewId={reviewId} />
          ) : (
            <p style={{ margin: 0, color: colors.muted, fontSize: "0.875rem" }}>Нет скриншотов</p>
          )}
        </div>
      )}

      {tab === "settings" && (
        <form onSubmit={handleSaveSettings} style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <Field label="Handle">
            <input style={fieldInput} value={form.managerHandle} onChange={(e) => setForm({ ...form, managerHandle: e.target.value })} />
          </Field>
          <Field label="Имя менеджера">
            <input style={fieldInput} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
          </Field>
          <Field label="Депозит">
            <textarea style={{ ...fieldInput, minHeight: 64, resize: "vertical" }} value={form.depositMessageTemplate} onChange={(e) => setForm({ ...form, depositMessageTemplate: e.target.value })} />
          </Field>
          <Field label="Выплата">
            <textarea style={{ ...fieldInput, minHeight: 48, resize: "vertical" }} value={form.payoutMessageTemplate} onChange={(e) => setForm({ ...form, payoutMessageTemplate: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem" }}>
            <Field label="Входящие">
              <input type="color" style={{ ...fieldInput, height: 36, padding: 2 }} value={form.incomingBubble} onChange={(e) => setForm({ ...form, incomingBubble: e.target.value })} />
            </Field>
            <Field label="Исходящие">
              <input type="color" style={{ ...fieldInput, height: 36, padding: 2 }} value={form.outgoingBubble} onChange={(e) => setForm({ ...form, outgoingBubble: e.target.value })} />
            </Field>
            <Field label="Акцент">
              <input type="color" style={{ ...fieldInput, height: 36, padding: 2 }} value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
            </Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
            <input type="checkbox" checked={form.twoPhaseReview} onChange={(e) => setForm({ ...form, twoPhaseReview: e.target.checked })} />
            Двухфазная публикация
          </label>
          <button type="submit" style={{ ...styles.button, alignSelf: "flex-start" }} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0.4rem 0.75rem",
        borderRadius: 0,
        border: "none",
        borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
        cursor: "pointer",
        fontSize: "0.875rem",
        fontWeight: active ? 500 : 400,
        background: "transparent",
        color: active ? colors.text : colors.muted,
        marginBottom: -1,
      }}
    >
      {children}
    </button>
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

const projectCardStyle: React.CSSProperties = {
  background: colors.card,
  borderRadius: radius.md,
  padding: "1rem 1.15rem",
  border: `1px solid ${colors.border}`,
  marginBottom: "0.75rem",
};
