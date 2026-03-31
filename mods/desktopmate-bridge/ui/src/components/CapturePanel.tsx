import { useState } from "react";
import { signals } from "@hmcs/sdk";
import { useStore } from "../store";
import { listWindows, captureScreen, captureWindow } from "../api";

export function CapturePanel() {
  const {
    captureMode,
    captureWindowList,
    captureSelectedWindowId,
    capturePreview,
    setCaptureMode,
    setCaptureWindowList,
    setCaptureSelectedWindowId,
    setCapturePreview,
  } = useStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  async function handleModeChange(mode: "fullscreen" | "window") {
    setCaptureMode(mode);
    signals.send("dm-capture-mode", mode).catch(() => {});
    if (mode === "window") {
      const windows = await listWindows().catch(() => [] as { id: string; title: string }[]);
      setCaptureWindowList(windows);
      signals.send("dm-capture-window-list", windows).catch(() => {});
    } else {
      const result = await captureScreen().catch(() => null);
      if (result) {
        setCapturePreview(result.base64);
        signals.send("dm-capture-preview", result.base64).catch(() => {});
      }
    }
  }

  async function handleWindowSelect(id: string) {
    setCaptureSelectedWindowId(id);
    setDropdownOpen(false);
    signals.send("dm-capture-selected-window", id).catch(() => {});
    const result = await captureWindow(id).catch(() => null);
    if (result) {
      setCapturePreview(result.base64);
      signals.send("dm-capture-preview", result.base64).catch(() => {});
    }
  }

  const selectedWindow = captureWindowList.find((w) => w.id === captureSelectedWindowId);
  const modeBtnBase = "text-xs px-2 py-1 rounded border border-white/20 text-white/70 hover:text-white transition-colors";
  const modeBtnActive = "btn-mode-active border-blue-400/60 bg-blue-500/20 text-blue-300";

  return (
    <div className="px-2 py-1 bg-black/30 backdrop-blur-sm border-t border-white/10">
      <div className="flex items-center gap-1 mb-1">
        <button
          title="Fullscreen mode"
          className={`${modeBtnBase} ${captureMode === "fullscreen" ? modeBtnActive : ""}`}
          onClick={() => handleModeChange("fullscreen")}
        >
          🖥 Fullscreen
        </button>
        <button
          title="Window mode"
          className={`${modeBtnBase} ${captureMode === "window" ? modeBtnActive : ""}`}
          onClick={() => handleModeChange("window")}
        >
          🪟 Window
        </button>
      </div>

      {captureMode === "window" && (
        <div data-testid="window-selector" className="relative mb-1">
          <button
            data-testid="window-dropdown-trigger"
            className="w-full text-left text-xs px-2 py-1 bg-white/10 text-white/70 rounded hover:bg-white/20"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            {selectedWindow ? selectedWindow.title : "Select window…"}
          </button>
          {dropdownOpen && captureWindowList.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-0.5 bg-black/95 backdrop-blur-sm border border-white/10 rounded shadow-xl z-50 max-h-40 overflow-y-auto">
              {captureWindowList.map((w) => (
                <li key={w.id}>
                  <button
                    className="w-full text-left text-xs px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={() => handleWindowSelect(w.id)}
                  >
                    {w.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="h-12 border border-white/10 bg-white/5 rounded overflow-hidden flex items-center justify-center">
        {capturePreview ? (
          <img
            src={`data:image/png;base64,${capturePreview}`}
            alt="Capture preview"
            className="h-full object-contain"
          />
        ) : (
          <span className="text-white/30 text-xs">No preview</span>
        )}
      </div>
    </div>
  );
}
