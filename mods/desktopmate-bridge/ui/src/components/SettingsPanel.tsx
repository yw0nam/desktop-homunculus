import { useStore } from "../store";

export function SettingsPanel() {
  const { settings } = useStore();

  return (
    <div className="w-44 flex flex-col bg-black/30 backdrop-blur-sm border-l border-white/10 p-3 gap-3">
      <div className="text-white/80 text-xs font-semibold">
        Settings <span className="text-white/30">(read-only)</span>
      </div>
      <SettingField label="user_id" value={settings.user_id} />
      <SettingField label="agent_id" value={settings.agent_id} />
      <SettingField label="FastAPI URL" value={settings.fastapi_rest_url} />
      <div className="text-white/30 text-[10px] mt-auto">
        config.yaml에서 편집
      </div>
    </div>
  );
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/50 text-[10px]">{label}:</div>
      <div className="text-white text-xs truncate">{value || "—"}</div>
    </div>
  );
}
