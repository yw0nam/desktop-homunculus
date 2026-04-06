import { useState, useEffect } from "react";
import { useStore } from "../store";
import { updateConfig } from "../api";
import type { DmConfig } from "../types";

export function SettingsPanel() {
  const { settings } = useStore();
  const [form, setForm] = useState<DmConfig>(settings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function handleChange(key: keyof DmConfig, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setStatus("saving");
    try {
      await updateConfig(form);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const saveLabel = {
    idle: "Save",
    saving: "Saving...",
    saved: "✔ Saved",
    error: "✖ Error",
  }[status];

  return (
    <div data-testid="settings-panel" className="w-52 flex flex-col bg-black/30 backdrop-blur-sm border-l border-white/10 p-3 gap-2 overflow-y-auto">
      <div className="text-white/80 text-xs font-semibold">⚙ Settings</div>
      <SettingInput label="user_id" value={form.user_id} onChange={(v) => handleChange("user_id", v)} />
      <SettingInput label="agent_id" value={form.agent_id} onChange={(v) => handleChange("agent_id", v)} />
      <SettingInput label="FastAPI REST URL" value={form.fastapi_rest_url} onChange={(v) => handleChange("fastapi_rest_url", v)} />
      <SettingInput label="FastAPI WS URL" value={form.fastapi_ws_url} onChange={(v) => handleChange("fastapi_ws_url", v)} />
      <SettingInput label="Token" value={form.fastapi_token ?? ""} onChange={(v) => handleChange("fastapi_token", v)} type="password" />
      <SettingInput label="Homunculus API URL" value={form.homunculus_api_url} onChange={(v) => handleChange("homunculus_api_url", v)} />
      <SettingInput label="TTS Reference ID" value={form.tts_reference_id} onChange={(v) => handleChange("tts_reference_id", v)} />
      <button
        className="mt-1 bg-white/15 border border-white/25 rounded px-2 py-1 text-white text-xs hover:bg-white/25 disabled:opacity-40"
        onClick={handleSave}
        disabled={status === "saving"}
      >
        {saveLabel}
      </button>
    </div>
  );
}

function SettingInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
}) {
  return (
    <div>
      <div className="text-white/40 text-[10px] mb-0.5">{label}</div>
      <input
        type={type}
        className="w-full bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white text-xs outline-none focus:border-white/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
