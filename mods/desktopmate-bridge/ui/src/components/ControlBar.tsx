import { useRef, useState, useCallback } from "react";
import { Webview } from "@hmcs/sdk";
import { useStore } from "../store";
import { sendChatMessage, interruptStream, captureScreen, captureWindow, reconnect } from "../api";
import type { ConnectionStatus, ImageContent } from "../types";

interface ControlBarProps {
  onToggleChat: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleCapture: () => void;
  captureActive: boolean;
}

interface ReconnectButtonProps {
  isReconnecting: boolean;
  onReconnect: () => void;
}

function ReconnectButton({ isReconnecting, onReconnect }: ReconnectButtonProps) {
  return (
    <button
      title="Reconnect"
      onClick={onReconnect}
      disabled={isReconnecting}
      className={
        isReconnecting
          ? "text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
          : "text-xs px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-colors duration-150 active:scale-95"
      }
    >
      {isReconnecting ? "↺ Reconnecting…" : "↺ Reconnect"}
    </button>
  );
}

async function captureImages(
  captureMode: "fullscreen" | "window",
  captureSelectedWindowId: string | null,
): Promise<ImageContent[] | undefined> {
  try {
    if (captureMode === "fullscreen") {
      const { base64 } = await captureScreen();
      return [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "auto" } }];
    }
    if (captureSelectedWindowId) {
      const { base64 } = await captureWindow(captureSelectedWindowId);
      return [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "auto" } }];
    }
  } catch {
    // capture failure is non-fatal; send message without image
  }
  return undefined;
}

const STATUS_LABELS = {
  connected: "✔ Connected",
  disconnected: "✖ Disconnected",
  "restart-required": "⚠ Restart required",
} satisfies Record<ConnectionStatus, string>;

export function ControlBar({
  onToggleChat,
  onToggleSidebar,
  onToggleSettings,
  onToggleCapture,
  captureActive,
}: ControlBarProps) {
  const [input, setInput] = useState("");
  const [isReconnecting, setIsReconnecting] = useState(false);
  const {
    isTyping,
    connectionStatus,
    activeSessionId,
    addUserMessage,
    captureMode,
    captureSelectedWindowId,
  } = useStore();

  const dragState = useRef<{
    startX: number;
    startY: number;
    startOffset: [number, number];
    scale: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestMoveEventRef = useRef<MouseEvent | null>(null);

  const statusLabel = STATUS_LABELS[connectionStatus];
  const showReconnect = connectionStatus === "disconnected" || connectionStatus === "restart-required";

  async function handleReconnect() {
    if (isReconnecting) return;
    setIsReconnecting(true);
    try {
      await reconnect();
    } catch {
      // connection failure is surfaced via connectionStatus signal
    } finally {
      setIsReconnecting(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || isTyping) return;
    const content = input.trim();
    setInput("");
    addUserMessage(content);
    const images = captureActive
      ? await captureImages(captureMode, captureSelectedWindowId)
      : undefined;
    try {
      await sendChatMessage(activeSessionId ?? undefined, content, images);
    } catch {
      // message is already shown in UI; WS send failure is handled by connection status
    }
  }

  async function handleStop() {
    try {
      await interruptStream();
    } catch {
      // engine unavailable
    }
  }

  async function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const wv = Webview.current();
    if (!wv) return;
    try {
      const info = await wv.info();
      const scale =
        info.size?.width > 0 && info.viewportSize?.width
          ? info.viewportSize.width / info.size.width
          : 0.002;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffset: info.offset,
        scale,
      };
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
    } catch {
      // engine unavailable
    }
  }

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    latestMoveEventRef.current = e;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const latest = latestMoveEventRef.current;
      if (!dragState.current || !latest) return;
      const wv = Webview.current();
      if (!wv) return;
      const { startX, startY, startOffset, scale } = dragState.current;
      const dx = (latest.clientX - startX) * scale;
      const dy = (latest.clientY - startY) * scale;
      wv.setOffset([
        startOffset[0] + dx,
        startOffset[1] - dy,
      ]).catch(() => {});
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dragState.current = null;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
  }, [handleDragMove]);

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-black/30 backdrop-blur-sm border-t border-white/10">
      <div className="flex items-center justify-center gap-2">
        <div className="text-xs text-white/60">{statusLabel}</div>
        {showReconnect && (
          <ReconnectButton isReconnecting={isReconnecting} onReconnect={handleReconnect} />
        )}
      </div>
      <div className="flex items-center gap-1">
        <div
          role="button"
          tabIndex={0}
          className="text-white/60 text-xs px-1 hover:text-white cursor-grab active:cursor-grabbing"
          onMouseDown={handleDragStart}
          title="Drag"
        >
          ⠿
        </div>
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
        <button
          className={`text-xs px-1 hover:text-white ${captureActive ? "text-blue-400 btn-capture-active" : "text-white/60"}`}
          onClick={onToggleCapture}
          title="Screen Capture"
        >
          📷
        </button>
      </div>
    </div>
  );
}
