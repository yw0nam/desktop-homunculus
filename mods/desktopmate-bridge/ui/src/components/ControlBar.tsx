import { useState } from "react";
import { useStore } from "../store";
import { sendChatMessage, interruptStream } from "../api";

interface ControlBarProps {
  onToggleChat: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
}

export function ControlBar({
  onToggleChat,
  onToggleSidebar,
  onToggleSettings,
}: ControlBarProps) {
  const [input, setInput] = useState("");
  const { isTyping, connectionStatus, activeSessionId, addUserMessage } =
    useStore();

  const statusLabel = {
    connected: "✔ Connected",
    disconnected: "✖ Disconnected",
    "restart-required": "⚠ 백엔드 재시작 필요",
  }[connectionStatus];

  async function handleSend() {
    if (!input.trim() || isTyping) return;
    const content = input.trim();
    setInput("");
    addUserMessage(content);
    await sendChatMessage(activeSessionId ?? undefined, content);
  }

  async function handleStop() {
    await interruptStream();
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-black/30 backdrop-blur-sm border-t border-white/10">
      <div className="text-xs text-white/60 text-center">{statusLabel}</div>
      <div className="flex items-center gap-1">
        <button
          className="text-white/60 text-xs px-1 hover:text-white"
          onClick={onToggleSidebar}
          title="Session List"
        >
          ☰
        </button>
        <input
          className="flex-1 bg-white/10 text-white text-sm rounded px-2 py-1 outline-none placeholder-white/40"
          placeholder="Enter message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={isTyping}
        />
        {isTyping ? (
          <button
            className="text-red-400 text-xs px-2 py-1 hover:text-red-300"
            onClick={handleStop}
          >
            Stop
          </button>
        ) : (
          <button
            className="text-white/80 text-xs px-2 py-1 hover:text-white disabled:opacity-30"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
        <button
          className="text-white/60 text-xs px-1 hover:text-white"
          onClick={onToggleChat}
          title="Chat History"
        >
          💬
        </button>
        <button
          className="text-white/60 text-xs px-1 hover:text-white"
          onClick={onToggleSettings}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
