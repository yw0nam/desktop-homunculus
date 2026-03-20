import { useState } from "react";
import { useSignals } from "./hooks/useSignals";
import { ControlBar } from "./components/ControlBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { SettingsPanel } from "./components/SettingsPanel";

export function App() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useSignals();

  return (
    <div className="w-full h-full flex flex-col bg-black/20 backdrop-blur-sm text-white">
      {/* 상단 패널 영역 */}
      <div className="flex-1 flex overflow-hidden">
        {showSidebar && <SessionSidebar />}
        {showChat && <ChatWindow />}
        {showSettings && <SettingsPanel />}
        {!showSidebar && !showChat && !showSettings && (
          <div className="flex-1" />
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <ControlBar
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onToggleChat={() => setShowChat((v) => !v)}
        onToggleSettings={() => setShowSettings((v) => !v)}
      />
    </div>
  );
}
