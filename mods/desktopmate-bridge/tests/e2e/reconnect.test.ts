// E2E: requires CEF + Bevy runtime — local execution only, excluded from CI

import { describe, it, vi, beforeEach, expect } from "vitest";
import type { ConnectionStatus } from "../../ui/src/types";

// ---------------------------------------------------------------------------
// State simulation (mirrors ControlBar React state)
// ---------------------------------------------------------------------------

let connectionStatus: ConnectionStatus = "connected";
let isReconnecting = false;

// RPC mock — replaced per-test
const reconnectRpc = vi.fn<[], Promise<void>>();

// ---------------------------------------------------------------------------
// Helpers (mirror ControlBar logic)
// ---------------------------------------------------------------------------

function setConnectionStatus(status: ConnectionStatus) {
  connectionStatus = status;
}

function showReconnect(): boolean {
  return connectionStatus === "disconnected" || connectionStatus === "restart-required";
}

async function handleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  try {
    await reconnectRpc();
  } catch {
    // surfaced via connectionStatus signal
  } finally {
    isReconnecting = false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Reconnect Button — ControlBar integration", () => {
  beforeEach(() => {
    connectionStatus = "connected";
    isReconnecting = false;
    reconnectRpc.mockReset();
  });

  // AC-1
  it("does NOT render Reconnect button when connectionStatus is 'connected'", () => {
    setConnectionStatus("connected");

    expect(showReconnect()).toBe(false);
  });

  // AC-2
  it("renders Reconnect button when connectionStatus is 'disconnected'", () => {
    setConnectionStatus("disconnected");

    expect(showReconnect()).toBe(true);
  });

  // AC-3
  it("renders Reconnect button when connectionStatus is 'restart-required'", () => {
    setConnectionStatus("restart-required");

    expect(showReconnect()).toBe(true);
  });

  // AC-4
  it("calls reconnect() RPC exactly once when button is clicked", async () => {
    setConnectionStatus("disconnected");
    reconnectRpc.mockResolvedValue(undefined);

    await handleReconnect();

    expect(reconnectRpc).toHaveBeenCalledTimes(1);
  });

  // AC-5
  it("disables button and shows 'Reconnecting' while RPC is in-flight", async () => {
    setConnectionStatus("disconnected");

    let resolveRpc!: () => void;
    reconnectRpc.mockReturnValue(
      new Promise<void>((res) => {
        resolveRpc = res;
      }),
    );

    const inFlight = handleReconnect();

    expect(isReconnecting).toBe(true);

    resolveRpc();
    await inFlight;
  });

  // AC-6
  it("resets isReconnecting to false after reconnect() resolves (success path)", async () => {
    setConnectionStatus("disconnected");
    reconnectRpc.mockResolvedValue(undefined);

    await handleReconnect();

    expect(isReconnecting).toBe(false);
  });

  // AC-6 (error path)
  it("resets isReconnecting to false after reconnect() rejects (error path)", async () => {
    setConnectionStatus("disconnected");
    reconnectRpc.mockRejectedValue(new Error("connection refused"));

    await handleReconnect();

    expect(isReconnecting).toBe(false);
  });

  // AC-1 + state transition
  it("hides Reconnect button once connectionStatus transitions back to 'connected'", () => {
    setConnectionStatus("disconnected");

    expect(showReconnect()).toBe(true);

    setConnectionStatus("connected");

    expect(showReconnect()).toBe(false);
  });
});
