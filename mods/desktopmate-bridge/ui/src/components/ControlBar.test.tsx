// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

const mockWebview = {
  info: vi.fn().mockResolvedValue({
    offset: [0, 0] as [number, number],
    size: { width: 400, height: 300 },
    viewportSize: { width: 800, height: 600 },
  }),
  setOffset: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@hmcs/sdk", () => ({
  Webview: {
    current: vi.fn().mockReturnValue(mockWebview),
  },
}));

vi.mock("../store", () => ({
  useStore: vi.fn().mockReturnValue({
    isTyping: false,
    connectionStatus: "disconnected",
    activeSessionId: null,
    addUserMessage: vi.fn(),
    captureMode: "fullscreen" as const,
    captureSelectedWindowId: null,
  }),
}));

vi.mock("../api", () => ({
  sendChatMessage: vi.fn().mockResolvedValue(undefined),
  interruptStream: vi.fn(),
  captureScreen: vi.fn().mockResolvedValue({ base64: "screen-base64" }),
  captureWindow: vi.fn().mockResolvedValue({ base64: "window-base64" }),
}));

import { ControlBar } from "./ControlBar";
import { useStore } from "../store";
import { sendChatMessage, captureScreen, captureWindow } from "../api";

const noop = () => {};

function renderControlBar(props?: Partial<{ captureActive: boolean; onToggleCapture: () => void }>) {
  return render(
    <ControlBar
      onToggleChat={noop}
      onToggleSidebar={noop}
      onToggleSettings={noop}
      onToggleCapture={noop}
      captureActive={false}
      {...props}
    />
  );
}

describe("ControlBar — capture toggle button", () => {
  it("renders 📷 button with title 'Screen Capture'", () => {
    const { getByTitle } = renderControlBar();
    expect(getByTitle("Screen Capture")).toBeTruthy();
  });

  it("calls onToggleCapture when 📷 button is clicked", () => {
    const onToggleCapture = vi.fn();
    const { getByTitle } = renderControlBar({ onToggleCapture });
    fireEvent.click(getByTitle("Screen Capture"));
    expect(onToggleCapture).toHaveBeenCalledOnce();
  });

  it("applies btn-capture-active class when captureActive is true", () => {
    const { getByTitle } = renderControlBar({ captureActive: true });
    const btn = getByTitle("Screen Capture");
    expect(btn.className).toContain("btn-capture-active");
  });

  it("does not apply btn-capture-active class when captureActive is false", () => {
    const { getByTitle } = renderControlBar({ captureActive: false });
    const btn = getByTitle("Screen Capture");
    expect(btn.className).not.toContain("btn-capture-active");
  });
});

describe("ControlBar — drag handle element", () => {
  it("renders drag handle as div[role=button], not <button>", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");
    expect(handle.tagName.toLowerCase()).toBe("div");
    expect(handle.getAttribute("role")).toBe("button");
  });

  it("drag handle has tabIndex=0", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");
    expect(handle.tabIndex).toBe(0);
  });

  it("handleDragStart calls preventDefault and stopPropagation", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");
    const stopPropagationSpy = vi.spyOn(Event.prototype, "stopPropagation");

    fireEvent.mouseDown(handle);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
    stopPropagationSpy.mockRestore();
  });
});

describe("ControlBar — DH-BUG-12: drag dynamic scale + RAF throttle", () => {
  beforeEach(() => {
    mockWebview.info.mockClear();
    mockWebview.setOffset.mockClear();
    mockWebview.info.mockResolvedValue({
      offset: [0, 0] as [number, number],
      size: { width: 400, height: 300 },
      viewportSize: { width: 800, height: 600 },
    });
  });

  it("handleDragStart calls wv.info() to read offset, size, viewportSize", async () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    await act(async () => {
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
      // allow the async handleDragStart to settle
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockWebview.info).toHaveBeenCalled();
  });

  it("does not call setOffset synchronously on handleDragMove (RAF throttle)", async () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    await act(async () => {
      fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Trigger mousemove — setOffset should NOT be called synchronously
    // because it's wrapped in requestAnimationFrame
    fireEvent.mouseMove(window, { clientX: 50, clientY: 50 });

    // Synchronously after mousemove, setOffset should not have been called yet
    // (RAF callback is deferred)
    // We just verify the absence of immediate calls
    expect(mockWebview.setOffset).not.toHaveBeenCalled();
  });
});

describe("ControlBar — DH-BUG-11: send with capture returns ImageContent objects", () => {
  beforeEach(() => {
    vi.mocked(sendChatMessage).mockClear();
    vi.mocked(captureScreen).mockClear();
    vi.mocked(captureWindow).mockClear();
    vi.mocked(captureScreen).mockResolvedValue({ base64: "screen-base64" });
    vi.mocked(captureWindow).mockResolvedValue({ base64: "window-base64" });
  });

  it("does not capture when captureActive=false", async () => {
    vi.mocked(useStore).mockReturnValue({
      isTyping: false,
      connectionStatus: "disconnected",
      activeSessionId: null,
      addUserMessage: vi.fn(),
      captureMode: "fullscreen",
      captureSelectedWindowId: null,
    });

    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: false });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledWith(undefined, "hello", undefined);
    });
    expect(captureScreen).not.toHaveBeenCalled();
  });

  it("captures fullscreen and attaches ImageContent when captureActive=true and captureMode=fullscreen", async () => {
    vi.mocked(useStore).mockReturnValue({
      isTyping: false,
      connectionStatus: "disconnected",
      activeSessionId: null,
      addUserMessage: vi.fn(),
      captureMode: "fullscreen",
      captureSelectedWindowId: null,
    });

    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: true });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(captureScreen).toHaveBeenCalled();
      expect(sendChatMessage).toHaveBeenCalledWith(
        undefined,
        "hello",
        [{ type: "image_url", image_url: { url: "data:image/png;base64,screen-base64", detail: "auto" } }],
      );
    });
  });

  it("captures window and attaches ImageContent when captureActive=true and captureMode=window with selectedWindowId", async () => {
    vi.mocked(useStore).mockReturnValue({
      isTyping: false,
      connectionStatus: "disconnected",
      activeSessionId: null,
      addUserMessage: vi.fn(),
      captureMode: "window",
      captureSelectedWindowId: "win-42",
    });

    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: true });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(captureWindow).toHaveBeenCalledWith("win-42");
      expect(sendChatMessage).toHaveBeenCalledWith(
        undefined,
        "hello",
        [{ type: "image_url", image_url: { url: "data:image/png;base64,window-base64", detail: "auto" } }],
      );
    });
  });

  it("sends without images when captureMode=window but no window selected", async () => {
    vi.mocked(useStore).mockReturnValue({
      isTyping: false,
      connectionStatus: "disconnected",
      activeSessionId: null,
      addUserMessage: vi.fn(),
      captureMode: "window",
      captureSelectedWindowId: null,
    });

    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: true });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(captureWindow).not.toHaveBeenCalled();
      expect(sendChatMessage).toHaveBeenCalledWith(undefined, "hello", undefined);
    });
  });
});
