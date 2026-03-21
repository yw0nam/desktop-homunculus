import { useRef, useState } from "react";
import { Webview } from "@hmcs/sdk";
import { useStore } from "../store";
import { sendChatMessage, interruptStream } from "../api";

interface ControlBarProps {
  onToggleChat: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
}

const DRAG_SCALE = 0.002;

export function ControlBar({
  onToggleChat,
  onToggleSidebar,
  onToggleSettings,
}: ControlBarProps) {
  const [input, setInput] = useState("");
  const { isTyping, connectionStatus, activeSessionId, addUserMessage } =
    useStore();

  const dragState = useRef<{
    startX: number;
    startY: number;
    startOffset: [number, number];
  } | null>(null);

  const statusLabel = {
    connected: "✔ Connected",
    disconnected: "✖ Disconnected",
    "restart-required": "⚠ Restart required",
  }[connectionStatus];

  async function handleSend() {
    if (!input.trim() || isTyping) return;
    const content = input.trim();
    setInput("");
    addUserMessage(content);
    try {
      await sendChatMessage(activeSessionId ?? undefined, content);
    } catch {
      // message is already shown in UI; WS send failure is handled by connection status
    }
  }

  async function handleStop() {
    await interruptStream();
  }

  async function handleDragStart(e: React.MouseEvent) {
    const wv = Webview.current();
    if (!wv) return;
    try {
      const info = await wv.info();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffset: info.offset,
      };
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
    } catch {
      // engine unavailable
    }
  }

  function handleDragMove(e: MouseEvent) {
    if (!dragState.current) return;
    const wv = Webview.current();
    if (!wv) return;
    const dx = (e.clientX - dragState.current.startX) * DRAG_SCALE;
    const dy = (e.clientY - dragState.current.startY) * DRAG_SCALE;
    wv.setOffset([
      dragState.current.startOffset[0] + dx,
      dragState.current.startOffset[1] - dy,
    ]).catch(() => {});
  }

  function handleDragEnd() {
    dragState.current = null;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-black/30 backdrop-blur-sm border-t border-white/10">
      <div className="text-xs text-white/60 text-center">{statusLabel}</div>
      <div className="flex items-center gap-1">
        <button
          className="text-white/60 text-xs px-1 hover:text-white cursor-grab active:cursor-grabbing"
          onMouseDown={handleDragStart}
          title="Drag"
        >
          ⠿
        </button>
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
