// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

const mockWebview = vi.hoisted(() => ({
  info: vi.fn().mockResolvedValue({
    offset: [0, 0] as [number, number],
    size: [400, 300] as [number, number],
    viewportSize: [800, 600] as [number, number],
  }),
  setOffset: vi.fn().mockResolvedValue(undefined),
}));

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
  reconnect: vi.fn().mockResolvedValue(undefined),
}));

import { ControlBar } from "./ControlBar";
import { useStore } from "../store";
import { sendChatMessage, captureScreen, captureWindow, reconnect } from "../api";

beforeEach(() => mockStore());

const noop = () => {};

function mockStore(overrides: Partial<ReturnType<typeof useStore>> = {}) {
  vi.mocked(useStore).mockReturnValue({
    isTyping: false,
    connectionStatus: "disconnected",
    activeSessionId: null,
    addUserMessage: vi.fn(),
    captureMode: "fullscreen",
    captureSelectedWindowId: null,
    ...overrides,
  });
}

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

describe("ControlBar — DH-BUG-15: dragPending mouseup listener leak", () => {
  it("does NOT attach window mousemove/mouseup listeners when mouseup fires before wv.info() resolves", async () => {
    const { Webview } = await import("@hmcs/sdk");
    let resolveInfo!: (v: { offset: [number, number] }) => void;
    vi.mocked(Webview.current)!.mockReturnValue({
      info: vi.fn().mockReturnValue(new Promise<{ offset: [number, number] }>((res) => { resolveInfo = res; })),
      setOffset: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof Webview.current>);

    const addSpy = vi.spyOn(window, "addEventListener");

    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    // Start drag (triggers await wv.info())
    fireEvent.mouseDown(handle);

    // mouseup fires on handle before info() resolves → dragPending = false
    fireEvent.mouseUp(handle);

    // Now resolve info()
    resolveInfo({ offset: [0, 0] });
    await vi.waitFor(() => {});

    const calls = addSpy.mock.calls.map(([ev]) => ev);
    expect(calls).not.toContain("mousemove");
    expect(calls).not.toContain("mouseup");

    addSpy.mockRestore();
  });

  it("attaches window mousemove/mouseup listeners when mouseup does NOT fire before wv.info() resolves", async () => {
    const { Webview } = await import("@hmcs/sdk");
    vi.mocked(Webview.current)!.mockReturnValue({
      info: vi.fn().mockResolvedValue({ offset: [0, 0] }),
      setOffset: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof Webview.current>);

    const addSpy = vi.spyOn(window, "addEventListener");

    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    fireEvent.mouseDown(handle);

    await vi.waitFor(() => {
      const calls = addSpy.mock.calls.map(([ev]) => ev);
      expect(calls).toContain("mousemove");
      expect(calls).toContain("mouseup");
    });

    addSpy.mockRestore();
  });
});

describe("ControlBar — DH-BUG-12: drag dynamic scale + RAF throttle", () => {
  beforeEach(async () => {
    mockWebview.info.mockClear();
    mockWebview.setOffset.mockClear();
    mockWebview.info.mockResolvedValue({
      offset: [0, 0] as [number, number],
      size: [400, 300] as [number, number],
      viewportSize: [800, 600] as [number, number],
    });
    // Restore Webview.current to return the shared mock (DH-BUG-15 overrides it)
    const { Webview } = await import("@hmcs/sdk");
    vi.mocked(Webview.current)!.mockReturnValue(mockWebview as ReturnType<typeof Webview.current>);
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
    mockStore({ connectionStatus: "connected" });
    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: false });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledWith(undefined, "hello", undefined);
    });
    expect(captureScreen).not.toHaveBeenCalled();
  });

  it("captures fullscreen and attaches ImageContent when captureActive=true and captureMode=fullscreen", async () => {
    mockStore({ connectionStatus: "connected" });
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
    mockStore({ connectionStatus: "connected", captureMode: "window", captureSelectedWindowId: "win-42" });
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
    mockStore({ connectionStatus: "connected", captureMode: "window" });
    const { getByPlaceholderText, getByText } = renderControlBar({ captureActive: true });
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    fireEvent.click(getByText("Send"));

    await vi.waitFor(() => {
      expect(captureWindow).not.toHaveBeenCalled();
      expect(sendChatMessage).toHaveBeenCalledWith(undefined, "hello", undefined);
    });
  });
});

describe("ControlBar — Send button disabled when disconnected", () => {
  it("Send button is disabled when connectionStatus is 'disconnected'", () => {
    mockStore({ connectionStatus: "disconnected" });
    const { getByText } = renderControlBar();
    const btn = getByText("Send") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Send button is disabled when connectionStatus is 'restart-required'", () => {
    mockStore({ connectionStatus: "restart-required" });
    const { getByText } = renderControlBar();
    const btn = getByText("Send") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Send button is enabled when connected and input has text", () => {
    mockStore({ connectionStatus: "connected" });
    const { getByText, getByPlaceholderText } = renderControlBar();
    fireEvent.change(getByPlaceholderText("Enter message..."), { target: { value: "hello" } });
    const btn = getByText("Send") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("Enter key does not call sendChatMessage when disconnected", async () => {
    vi.mocked(sendChatMessage).mockClear();
    const addUserMessage = vi.fn();
    mockStore({ connectionStatus: "disconnected", addUserMessage });
    const { getByPlaceholderText } = renderControlBar();
    const input = getByPlaceholderText("Enter message...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Give async handleSend a chance to execute (it shouldn't)
    await new Promise((r) => setTimeout(r, 50));
    expect(sendChatMessage).not.toHaveBeenCalled();
    expect(addUserMessage).not.toHaveBeenCalled();
  });

  it("Enter key sends message when connected", async () => {
    vi.mocked(sendChatMessage).mockClear();
    const addUserMessage = vi.fn();
    mockStore({ connectionStatus: "connected", addUserMessage });
    const { getByPlaceholderText } = renderControlBar();
    const input = getByPlaceholderText("Enter message...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(addUserMessage).toHaveBeenCalledWith("hello");
      expect(sendChatMessage).toHaveBeenCalled();
    });
  });
});

describe("ControlBar — DH-BUG-13: Reconnect button", () => {
  beforeEach(() => {
    vi.mocked(reconnect).mockClear();
    vi.mocked(reconnect).mockResolvedValue(undefined);
  });

  it("AC-1: does NOT render Reconnect button when connectionStatus is 'connected'", () => {
    mockStore({ connectionStatus: "connected" });
    const { queryByTitle } = renderControlBar();
    expect(queryByTitle("Reconnect")).toBeNull();
  });

  it("AC-2: renders Reconnect button when connectionStatus is 'disconnected'", () => {
    mockStore();
    const { getByTitle } = renderControlBar();
    expect(getByTitle("Reconnect")).toBeTruthy();
  });

  it("AC-3: renders Reconnect button when connectionStatus is 'restart-required'", () => {
    mockStore({ connectionStatus: "restart-required" });
    const { getByTitle } = renderControlBar();
    expect(getByTitle("Reconnect")).toBeTruthy();
  });

  it("AC-4: calls reconnect() RPC exactly once when button is clicked", async () => {
    mockStore();
    const { getByTitle } = renderControlBar();
    fireEvent.click(getByTitle("Reconnect"));

    await vi.waitFor(() => {
      expect(reconnect).toHaveBeenCalledTimes(1);
    });
  });

  it("AC-5: button is disabled and shows 'Reconnecting' while in-flight", async () => {
    mockStore();
    let resolveRpc!: () => void;
    vi.mocked(reconnect).mockReturnValue(
      new Promise<void>((res) => { resolveRpc = res; }),
    );

    const { getByTitle } = renderControlBar();
    fireEvent.click(getByTitle("Reconnect"));

    await vi.waitFor(() => {
      const btn = getByTitle("Reconnect");
      expect(btn.textContent).toMatch(/Reconnecting/);
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    resolveRpc();
  });

  it("AC-6 success: resets isReconnecting to false after reconnect() resolves", async () => {
    mockStore();
    vi.mocked(reconnect).mockResolvedValue(undefined);

    const { getByTitle } = renderControlBar();
    await act(async () => {
      fireEvent.click(getByTitle("Reconnect"));
      await new Promise((r) => setTimeout(r, 10));
    });

    const btn = getByTitle("Reconnect");
    expect(btn.textContent).toMatch(/Reconnect$/);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("AC-6 error: resets isReconnecting to false after reconnect() rejects", async () => {
    mockStore();
    vi.mocked(reconnect).mockRejectedValue(new Error("connection refused"));

    const { getByTitle } = renderControlBar();
    await act(async () => {
      fireEvent.click(getByTitle("Reconnect"));
      await new Promise((r) => setTimeout(r, 10));
    });

    const btn = getByTitle("Reconnect");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
