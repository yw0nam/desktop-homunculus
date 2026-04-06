/**
 * Mock for @hmcs/sdk — replaces SSE-based signals with in-memory EventBus.
 * Used when VITE_TEST_MODE=true (Playwright UI E2E).
 *
 * Playwright can trigger signals via:
 *   await page.evaluate(() => window.__signalBus__.emit("dm-connection-status", { status: "connected" }));
 */

type SignalHandler = (payload: unknown) => void | Promise<void>;

class SignalBus {
  private handlers = new Map<string, Set<SignalHandler>>();

  on(signal: string, handler: SignalHandler): () => void {
    if (!this.handlers.has(signal)) {
      this.handlers.set(signal, new Set());
    }
    this.handlers.get(signal)!.add(handler);
    return () => {
      this.handlers.get(signal)?.delete(handler);
    };
  }

  emit(signal: string, payload: unknown): void {
    this.handlers.get(signal)?.forEach((h) => {
      try { void h(payload); } catch { /* ignore */ }
    });
  }
}

const bus = new SignalBus();

declare global {
  interface Window {
    __signalBus__: SignalBus;
  }
}

window.__signalBus__ = bus;

export namespace signals {
  export function stream<V>(
    signal: string,
    f: (payload: V) => void | Promise<void>,
  ): { close: () => void } {
    const off = bus.on(signal, (payload) => f(payload as V));
    return { close: off };
  }

  export async function send<V>(signal: string, payload: V): Promise<void> {
    bus.emit(signal, payload);
  }
}

export namespace Webview {
  export function current(): null {
    return null;
  }
}
