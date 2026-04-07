// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("@hmcs/sdk", () => ({
  Webview: {
    current: vi.fn().mockReturnValue({
      info: vi.fn().mockResolvedValue({
        offset: [0, 0] as [number, number],
        size: [400, 300] as [number, number],
        viewportSize: [800, 600] as [number, number],
      }),
      setOffset: vi.fn().mockResolvedValue(undefined),
    }),
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
import { reconnect } from "../api";

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

function renderControlBar() {
  return render(
    <ControlBar
      onToggleChat={noop}
      onToggleSidebar={noop}
      onToggleSettings={noop}
      onToggleCapture={noop}
      captureActive={false}
    />
  );
}

beforeEach(() => mockStore());

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
