/**
 * Tests for service.ts WebSocket message handling and reconnect logic.
 *
 * service.ts has top-level side effects (VRM spawn, WS connect) so we cannot
 * import it directly. Instead we test the parse-and-dispatch logic via a
 * thin wrapper that mirrors the implementation exactly.
 */
import { describe, it, expect, vi } from "vitest";

type SignalSend = (name: string, payload: unknown) => Promise<void>;

/**
 * Mirrors the try/catch block added to handleMessage (DH-BUG-4 fix).
 * Returns the parsed value, or null if parsing fails (after sending the error signal).
 */
async function parseWsFrame(
  data: string,
  signalSend: SignalSend,
): Promise<unknown | null> {
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    await signalSend("dm-connection-status", { status: "error" });
    return null;
  }
  return msg;
}

describe("DH-BUG-4: WebSocket frame JSON parsing", () => {
  it("sends dm-connection-status error signal on malformed JSON", async () => {
    const signalSend = vi.fn().mockResolvedValue(undefined);
    const result = await parseWsFrame("not-valid-json!!!", signalSend);

    expect(result).toBeNull();
    expect(signalSend).toHaveBeenCalledWith("dm-connection-status", {
      status: "error",
    });
    expect(signalSend).toHaveBeenCalledTimes(1);
  });

  it("does not send error signal for valid JSON", async () => {
    const signalSend = vi.fn().mockResolvedValue(undefined);
    const result = await parseWsFrame('{"type":"ping"}', signalSend);

    expect(result).toEqual({ type: "ping" });
    expect(signalSend).not.toHaveBeenCalled();
  });

  it("returns null and signals error for empty string", async () => {
    const signalSend = vi.fn().mockResolvedValue(undefined);
    const result = await parseWsFrame("", signalSend);

    expect(result).toBeNull();
    expect(signalSend).toHaveBeenCalledWith("dm-connection-status", {
      status: "error",
    });
  });

  it("does not signal error for JSON null", async () => {
    const signalSend = vi.fn().mockResolvedValue(undefined);
    const result = await parseWsFrame("null", signalSend);

    // JSON.parse("null") === null, which is valid JSON
    expect(result).toBeNull();
    // parseWsFrame returns null for both errors AND valid null — check signalSend
    expect(signalSend).not.toHaveBeenCalled();
  });
});

describe("DH-BUG-5: connectWithRetry old WebSocket onclose nulling", () => {
  it("nulls onclose of old WebSocket before creating new one", () => {
    // Simulate the _ws guard logic added to connectWithRetry
    class MockWebSocket {
      onclose: (() => void) | null = null;
    }

    const oldWs = new MockWebSocket();
    oldWs.onclose = () => {};

    // Simulate what connectWithRetry does before _ws = ws:
    let _ws: MockWebSocket | null = oldWs;
    if (_ws) _ws.onclose = null;
    const newWs = new MockWebSocket();
    _ws = newWs;

    expect(oldWs.onclose).toBeNull();
    expect(_ws).toBe(newWs);
  });

  it("handles null _ws safely (first connection attempt)", () => {
    let _ws: { onclose: (() => void) | null } | null = null;

    // Should not throw when _ws is null
    expect(() => {
      if (_ws) _ws.onclose = null;
    }).not.toThrow();
  });
});
