"use client";

import { useEffect, useState } from "react";

import {
  AI_DIALOG_OPTIONS,
  AI_MODE_OPTIONS,
  CHAT_MODEL_OPTIONS,
  IMAGE_MODEL_OPTIONS,
  RECEIPT_MODEL_OPTIONS,
  type AiSettings,
  type AiSettingsPublic,
} from "@/lib/config/ai-settings-shared";
import { inputStyle } from "../styles";
import { LabelWithHelp } from "../ui/HelpTip";

function ModelSelect({
  label,
  help,
  value,
  options,
  onChange,
  allowCustom = true,
}: {
  label: string;
  help: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
}) {
  const known = options.some((o) => o.value === value);
  const [forceCustom, setForceCustom] = useState(false);
  const showCustom = forceCustom || !known;
  const field = inputStyle();

  return (
    <label className="admin-field">
      <LabelWithHelp label={label} tip={help} />
      <select
        className="admin-select"
        style={field}
        value={showCustom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setForceCustom(true);
            return;
          }
          setForceCustom(false);
          onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {allowCustom ? <option value="__custom__">Другая модель…</option> : null}
      </select>
      {showCustom ? (
        <input
          className="admin-input"
          style={{ ...field, marginTop: 8 }}
          value={value}
          placeholder="id модели OpenAI"
          onChange={(e) => onChange(e.target.value.trim())}
        />
      ) : null}
    </label>
  );
}

function apiKeyStatusText(settings: AiSettingsPublic): string {
  if (settings.apiKeySource === "settings") {
    return `Ключ сохранён в настройках${settings.apiKeyHint ? ` (${settings.apiKeyHint})` : ""}.`;
  }
  if (settings.apiKeySource === "env") {
    return `Ключ берётся из .env${settings.apiKeyHint ? ` (${settings.apiKeyHint})` : ""}. Можно вставить новый ниже — он перекроет .env.`;
  }
  return "Ключ не задан — вставьте OPENAI_API_KEY ниже.";
}

export function AiSettingsForm() {
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const field = inputStyle();

  useEffect(() => {
    void fetch("/api/admin/settings/ai")
      .then((r) => r.json())
      .then((d: { settings?: AiSettingsPublic; error?: string }) => {
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
      const body: Record<string, unknown> = {
        OPENAI_MODEL: settings.OPENAI_MODEL,
        OPENAI_IMAGE_MODEL: settings.OPENAI_IMAGE_MODEL,
        OPENAI_RECEIPT_IMAGE_MODEL: settings.OPENAI_RECEIPT_IMAGE_MODEL,
        AI_DIALOG: settings.AI_DIALOG,
        AI_CLIENT_PHOTOS: settings.AI_CLIENT_PHOTOS,
        AI_RECEIPTS: settings.AI_RECEIPTS,
        AI_MEDIA: settings.AI_MEDIA,
      };
      if (clearApiKey) {
        body.OPENAI_API_KEY = "";
      } else if (apiKeyDraft.trim()) {
        body.OPENAI_API_KEY = apiKeyDraft.trim();
      }

      const res = await fetch("/api/admin/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { settings?: AiSettingsPublic; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      if (data.settings) setSettings(data.settings);
      setApiKeyDraft("");
      setClearApiKey(false);
      setMessage("Сохранено. Применяется сразу, без перезапуска.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="admin-muted">Загрузка…</p>;
  if (!settings) return <p className="admin-muted">{message || "Не удалось загрузить настройки"}</p>;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 560 }}>
      <label className="admin-field">
        <LabelWithHelp
          label="OpenAI API ключ"
          tip="Сохраняется в config/ai-settings.json и перекрывает .env. Полный ключ в ответе API не отдаётся."
        />
        <p className="admin-muted" style={{ margin: "0 0 8px" }}>
          {apiKeyStatusText(settings)}
        </p>
        <input
          className="admin-input"
          style={field}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={settings.hasApiKey ? "Вставьте новый ключ, чтобы заменить" : "sk-..."}
          value={clearApiKey ? "" : apiKeyDraft}
          disabled={clearApiKey}
          onChange={(e) => {
            setClearApiKey(false);
            setApiKeyDraft(e.target.value);
          }}
        />
        {settings.apiKeySource === "settings" ? (
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
              checked={clearApiKey}
              onChange={(e) => {
                setClearApiKey(e.target.checked);
                if (e.target.checked) setApiKeyDraft("");
              }}
            />
            Удалить ключ из настроек (вернуться к .env)
          </label>
        ) : null}
      </label>

      <ModelSelect
        label="Модель диалогов"
        help="Тексты чатов (клиент / оператор). Обычно gpt-4o-mini."
        value={settings.OPENAI_MODEL}
        options={CHAT_MODEL_OPTIONS}
        onChange={(OPENAI_MODEL) => setSettings({ ...settings, OPENAI_MODEL })}
      />

      <label className="admin-field">
        <LabelWithHelp
          label="Диалоги (AI)"
          tip="Главный расход на текст. Выкл = локальный скрипт, без вызовов OpenAI."
        />
        <select
          className="admin-select"
          style={field}
          value={settings.AI_DIALOG}
          onChange={(e) =>
            setSettings({
              ...settings,
              AI_DIALOG: e.target.value as AiSettings["AI_DIALOG"],
            })
          }
        >
          {AI_DIALOG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <ModelSelect
        label="Модель картинок"
        help="Фото клиента, условия, аватар, обои, стикеры. Ставки и чеки ИИ не рисует — суммы печатаются на готовом скрине."
        value={settings.OPENAI_IMAGE_MODEL}
        options={IMAGE_MODEL_OPTIONS}
        onChange={(OPENAI_IMAGE_MODEL) => setSettings({ ...settings, OPENAI_IMAGE_MODEL })}
      />

      <ModelSelect
        label="Модель чеков / ставок"
        help="images.edit по исходному фото (чеки и ставки). Нужен gpt-image-1."
        value={settings.OPENAI_RECEIPT_IMAGE_MODEL}
        options={RECEIPT_MODEL_OPTIONS}
        onChange={(OPENAI_RECEIPT_IMAGE_MODEL) =>
          setSettings({ ...settings, OPENAI_RECEIPT_IMAGE_MODEL })
        }
      />

      <label className="admin-field">
        <LabelWithHelp
          label="Фото клиента (AI)"
          tip="Когда генерировать фото клиента через OpenAI, если в медиатеке пусто или всегда."
        />
        <select
          className="admin-select"
          style={field}
          value={settings.AI_CLIENT_PHOTOS}
          onChange={(e) =>
            setSettings({
              ...settings,
              AI_CLIENT_PHOTOS: e.target.value as AiSettings["AI_CLIENT_PHOTOS"],
            })
          }
        >
          {AI_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-field">
        <LabelWithHelp
          label="Чеки / ставки (AI)"
          tip="always/fallback: gpt-image правит копию исходника (чеки из receipt_templates, ставки из пака bets) — без белых OCR-плашек. Если ИИ упал: для ставок OCR-fallback, для чеков копия шаблона/HTML. off: только OCR/HTML. Исходники в library не перезаписываются."
        />
        <select
          className="admin-select"
          style={field}
          value={settings.AI_RECEIPTS}
          onChange={(e) =>
            setSettings({
              ...settings,
              AI_RECEIPTS: e.target.value as AiSettings["AI_RECEIPTS"],
            })
          }
        >
          {AI_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-field">
        <LabelWithHelp
          label="Медиа сцены (AI)"
          tip="Ставки, условия, стикеры, аватары, обои — когда генерировать через AI."
        />
        <select
          className="admin-select"
          style={field}
          value={settings.AI_MEDIA}
          onChange={(e) =>
            setSettings({
              ...settings,
              AI_MEDIA: e.target.value as AiSettings["AI_MEDIA"],
            })
          }
        >
          {AI_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="admin-btn" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={saving || !settings}
          onClick={() => {
            if (!settings) return;
            setSettings({
              ...settings,
              AI_DIALOG: "off",
              AI_CLIENT_PHOTOS: "off",
              AI_RECEIPTS: "off",
              AI_MEDIA: "off",
            });
            setMessage("Режим теста выбран — нажми «Сохранить», чтобы зафиксировать.");
          }}
        >
          Режим теста (всё AI выкл)
        </button>
        {message ? <span className="admin-muted">{message}</span> : null}
      </div>
    </div>
  );
}
