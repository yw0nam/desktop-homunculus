/**
 * MockWebSocket — shared stub for unit tests.
 *
 * Never connects to a real server. Prevents real network calls when
 * `vi.stubGlobal("WebSocket", MockWebSocket)` is used in test setup.
 */
export class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onclose: ((e: unknown) => void) | null = null;
  addEventListener(_event: string, _handler: unknown) {}
  removeEventListener(_event: string, _handler: unknown) {}
  send(_data: string) {}
  close() { this.readyState = 3; }
}
