import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// Mock @hmcs/sdk Webview
vi.mock("@hmcs/sdk", () => ({
  Webview: {
    current: vi.fn(),
  },
}));

const mockSetCaptureEnabled = vi.fn();
const mockSetCaptureMode = vi.fn();
const mockSetSelectedWindowId = vi.fn();
const mockSetWindowList = vi.fn();

const baseStoreState = {
  isTyping: false,
  connectionStatus: "disconnected" as const,
  activeSessionId: null,
  addUserMessage: vi.fn(),
  captureEnabled: false,
  captureMode: "fullscreen" as const,
  selectedWindowId: null,
  windowList: [],
  setCaptureEnabled: mockSetCaptureEnabled,
  setCaptureMode: mockSetCaptureMode,
  setSelectedWindowId: mockSetSelectedWindowId,
  setWindowList: mockSetWindowList,
};

// Mock store
vi.mock("../store", () => ({
  useStore: vi.fn(() => baseStoreState),
}));

// Mock api
vi.mock("../api", () => ({
  sendChatMessage: vi.fn(),
  interruptStream: vi.fn(),
  listWindows: vi.fn().mockResolvedValue([]),
}));

import { Webview } from "@hmcs/sdk";
import { useStore } from "../store";
import { listWindows } from "../api";
import { ControlBar } from "./ControlBar";

const defaultProps = {
  onToggleChat: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleSettings: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.mocked(useStore).mockReturnValue(baseStoreState);
});

describe("ControlBar — drag handle element", () => {
  it("renders drag handle as div with role=button and tabIndex=0, not a native button", () => {
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");
    expect(handle.tagName).toBe("DIV");
    expect(handle.getAttribute("role")).toBe("button");
    expect(handle.getAttribute("tabIndex") ?? handle.getAttribute("tabindex")).toBe("0");
  });
});

describe("ControlBar — handleDragStart", () => {
  let mockWv: { info: ReturnType<typeof vi.fn>; setOffset: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWv = {
      info: vi.fn().mockResolvedValue({ offset: [0.1, 0.2] }),
      setOffset: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(Webview.current).mockReturnValue(mockWv as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls e.preventDefault() on mousedown to block browser default drag", () => {
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    handle.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("calls e.stopPropagation() on mousedown to prevent event bubbling", () => {
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");
    handle.dispatchEvent(event);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it("calls wv.info() to get current offset on drag start", async () => {
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 200 });
    await vi.waitFor(() => {
      expect(mockWv.info).toHaveBeenCalled();
    });
  });

  it("does nothing when Webview.current() returns null", () => {
    vi.mocked(Webview.current).mockReturnValue(null as never);
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");
    expect(() => fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 })).not.toThrow();
  });
});

describe("ControlBar — capture toggle button", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders camera toggle button with title 'Capture'", () => {
    render(<ControlBar {...defaultProps} />);
    const btn = screen.getByTitle("Capture");
    expect(btn).toBeDefined();
  });

  it("calls setCaptureEnabled(true) when toggled on", () => {
    render(<ControlBar {...defaultProps} />);
    const btn = screen.getByTitle("Capture");
    fireEvent.click(btn);
    expect(mockSetCaptureEnabled).toHaveBeenCalledWith(true);
  });
});

describe("ControlBar — capture mode selector (captureEnabled=true)", () => {
  beforeEach(() => {
    vi.mocked(useStore).mockReturnValue({
      ...baseStoreState,
      captureEnabled: true,
      captureMode: "fullscreen" as const,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows mode selector when captureEnabled is true", () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByTitle("Capture mode")).toBeDefined();
  });

  it("calls setCaptureMode when mode changes", () => {
    render(<ControlBar {...defaultProps} />);
    const select = screen.getByTitle("Capture mode") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "window" } });
    expect(mockSetCaptureMode).toHaveBeenCalledWith("window");
  });

  it("calls listWindows when switching to window mode", async () => {
    render(<ControlBar {...defaultProps} />);
    const select = screen.getByTitle("Capture mode") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "window" } });
    await vi.waitFor(() => {
      expect(listWindows).toHaveBeenCalled();
    });
  });
});

describe("ControlBar — window list dropdown (captureMode=window)", () => {
  const mockWindows = [
    { id: 1, title: "VSCode", appName: "Code" },
    { id: 2, title: "Terminal", appName: "iTerm2" },
  ];

  beforeEach(() => {
    vi.mocked(useStore).mockReturnValue({
      ...baseStoreState,
      captureEnabled: true,
      captureMode: "window" as const,
      windowList: mockWindows,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows window list dropdown when captureMode is window", () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByTitle("Select window")).toBeDefined();
  });

  it("renders window options in the dropdown", () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByText("VSCode — Code")).toBeDefined();
    expect(screen.getByText("Terminal — iTerm2")).toBeDefined();
  });

  it("calls setSelectedWindowId when window is selected", () => {
    render(<ControlBar {...defaultProps} />);
    const select = screen.getByTitle("Select window") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    expect(mockSetSelectedWindowId).toHaveBeenCalledWith(1);
  });
});

describe("ControlBar — drag movement", () => {
  let mockWv: { info: ReturnType<typeof vi.fn>; setOffset: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWv = {
      info: vi.fn().mockResolvedValue({ offset: [0.0, 0.0] }),
      setOffset: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(Webview.current).mockReturnValue(mockWv as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls setOffset with scaled delta on mousemove after dragstart", async () => {
    render(<ControlBar {...defaultProps} />);
    const handle = screen.getByTitle("Drag");

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    await vi.waitFor(() => expect(mockWv.info).toHaveBeenCalled());

    fireEvent.mouseMove(window, { clientX: 200, clientY: 150 });

    await vi.waitFor(() => {
      expect(mockWv.setOffset).toHaveBeenCalled();
    });

    const call = mockWv.setOffset.mock.calls[0][0] as [number, number];
    expect(call[0]).toBeGreaterThan(0);
    expect(call[1]).toBeLessThan(0);
  });
});
