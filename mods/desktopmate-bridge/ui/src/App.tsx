import { useState } from "react";
import { useSignals } from "./hooks/useSignals";
import { ControlBar } from "./components/ControlBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { SettingsPanel } from "./components/SettingsPanel";

export function App() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useSignals();

  const anyPanelOpen = showSidebar || showChat || showSettings;

  return (
    <div className="w-full flex flex-col text-white">
      {anyPanelOpen && (
        <div className="flex overflow-hidden max-h-[350px] bg-black/20 backdrop-blur-sm">
          {showSidebar && <SessionSidebar />}
          {showChat && <ChatWindow />}
          {showSettings && <SettingsPanel />}
        </div>
      )}
      <ControlBar
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onToggleChat={() => setShowChat((v) => !v)}
        onToggleSettings={() => setShowSettings((v) => !v)}
      />
    </div>
  );
}
