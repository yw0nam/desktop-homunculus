import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// Mock @hmcs/sdk Webview
vi.mock("@hmcs/sdk", () => ({
  Webview: {
    current: vi.fn(),
  },
}));

// Mock store
vi.mock("../store", () => ({
  useStore: vi.fn(() => ({
    input: "",
    isTyping: false,
    connectionStatus: "disconnected" as const,
    activeSessionId: null,
    addUserMessage: vi.fn(),
  })),
}));

// Mock api
vi.mock("../api", () => ({
  sendChatMessage: vi.fn(),
  interruptStream: vi.fn(),
}));

import { Webview } from "@hmcs/sdk";
import { ControlBar } from "./ControlBar";

const defaultProps = {
  onToggleChat: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleSettings: vi.fn(),
};

afterEach(() => {
  cleanup();
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
    // allow async info() to resolve
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
    // wait for async info() to resolve and register listeners
    await vi.waitFor(() => expect(mockWv.info).toHaveBeenCalled());

    fireEvent.mouseMove(window, { clientX: 200, clientY: 150 });

    await vi.waitFor(() => {
      expect(mockWv.setOffset).toHaveBeenCalled();
    });

    const call = mockWv.setOffset.mock.calls[0][0] as [number, number];
    // dx = (200 - 100) * DRAG_SCALE, dy = (150 - 100) * DRAG_SCALE
    // offset[0] = 0 + dx, offset[1] = 0 - dy (Y-axis inverted)
    expect(call[0]).toBeGreaterThan(0); // positive X delta
    expect(call[1]).toBeLessThan(0);    // negative Y (inverted)
  });
});
