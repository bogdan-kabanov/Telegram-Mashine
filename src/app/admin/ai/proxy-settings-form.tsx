"use client";

import { useEffect, useState } from "react";

import type { ProxySettingsPublic } from "@/lib/config/proxy-settings-shared";
import { inputStyle } from "../styles";
import { LabelWithHelp } from "../ui/HelpTip";

function statusText(settings: ProxySettingsPublic): string {
  if (settings.source === "settings") {
    return `Прокси задан в настройках${settings.hint ? `: ${settings.hint}` : ""}.`;
  }
  if (settings.source === "env") {
    return `Прокси берётся из .env${settings.hint ? `: ${settings.hint}` : ""}. Можно задать ниже — перекроет .env.`;
  }
  return "Прокси не задан — исходящие запросы идут напрямую с сервера.";
}

export function ProxySettingsForm() {
  const [settings, setSettings] = useState<ProxySettingsPublic | null>(null);
  const [draft, setDraft] = useState("");
  const [clearProxy, setClearProxy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const field = inputStyle();

  useEffect(() => {
    void fetch("/api/admin/settings/proxy")
      .then((r) => r.json())
      .then((d: { settings?: ProxySettingsPublic; error?: string }) => {
        if (d.settings) setSettings(d.settings);
        if (d.error) setMessage(d.error);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      let PROXY_URL = "";
      if (clearProxy) {
        PROXY_URL = "";
      } else if (draft.trim()) {
        PROXY_URL = draft.trim();
      } else if (settings.source === "settings") {
        setMessage("Вставьте новый URL или отметьте «Удалить прокси».");
        setSaving(false);
        return;
      } else {
        // Nothing to save if not configured and draft empty
        setMessage("Вставьте URL прокси.");
        setSaving(false);
        return;
      }

      // Allow saving empty only when clearing; when first setting, need non-empty
      if (!clearProxy && !PROXY_URL) {
        setMessage("Вставьте URL прокси.");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/settings/proxy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PROXY_URL: clearProxy ? "" : PROXY_URL }),
      });
      const data = (await res.json()) as { settings?: ProxySettingsPublic; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      if (data.settings) setSettings(data.settings);
      setDraft("");
      setClearProxy(false);
      setMessage("Сохранено. Telegram и OpenAI сразу идут через прокси (без перезапуска).");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="admin-muted">Загрузка…</p>;
  if (!settings) return <p className="admin-muted">{message || "Не удалось загрузить настройки"}</p>;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <label className="admin-field">
        <LabelWithHelp
          label="HTTP(S) прокси"
          tip="Серверные ISP подойдут. Формат: http://login:password@ip:port. Используется для Telegram Bot API и OpenAI. Сохраняется в config/proxy-settings.json."
        />
        <p className="admin-muted" style={{ margin: "0 0 8px" }}>
          {statusText(settings)}
        </p>
        <input
          className="admin-input"
          style={field}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            settings.configured
              ? "Вставьте новый URL, чтобы заменить"
              : "http://user:pass@1.2.3.4:8080"
          }
          value={clearProxy ? "" : draft}
          disabled={clearProxy}
          onChange={(e) => {
            setClearProxy(false);
            setDraft(e.target.value);
          }}
        />
        {settings.source === "settings" ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 13,
              color: "var(--admin-muted, #6b7280)",
            }}
          >
            <input
              type="checkbox"
              checked={clearProxy}
              onChange={(e) => {
                setClearProxy(e.target.checked);
                if (e.target.checked) setDraft("");
              }}
            />
            Удалить прокси из настроек (вернуться к .env / прямому доступу)
          </label>
        ) : null}
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="admin-btn" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохранение…" : "Сохранить прокси"}
        </button>
        {message ? <span className="admin-muted">{message}</span> : null}
      </div>
    </div>
  );
}
