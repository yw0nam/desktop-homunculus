import { useState } from "react";
import { signals } from "@hmcs/sdk";
import { useSignals } from "./hooks/useSignals";
import { ControlBar } from "./components/ControlBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { SettingsPanel } from "./components/SettingsPanel";
import { CapturePanel } from "./components/CapturePanel";

export function App() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCapture, setShowCapture] = useState(false);

  useSignals();

  const anyPanelOpen = showSidebar || showChat || showSettings;

  function handleToggleCapture() {
    const next = !showCapture;
    setShowCapture(next);
    signals.send("dm-capture-enabled", next).catch(() => {});
  }

  return (
    <div className="w-full flex flex-col text-white">
      {anyPanelOpen && (
        <div className="flex overflow-hidden max-h-[350px] bg-black/20 backdrop-blur-sm">
          {showSidebar && <SessionSidebar />}
          {showChat && <ChatWindow />}
          {showSettings && <SettingsPanel />}
        </div>
      )}
      {showCapture && <CapturePanel />}
      <ControlBar
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onToggleChat={() => setShowChat((v) => !v)}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onToggleCapture={handleToggleCapture}
        captureActive={showCapture}
      />
    </div>
  );
}
