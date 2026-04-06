/**
 * Shared WebSocket helpers for E2E tests.
 * E2E: requires real FastAPI backend at FASTAPI_URL (default: http://localhost:5500)
 */

export const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:5500";
export const WS_URL = FASTAPI_URL.replace(/^http/, "ws") + "/v1/chat/stream";
export const TOKEN = process.env.FASTAPI_TOKEN ?? "test_token";
export const USER_ID = process.env.FASTAPI_USER_ID ?? "default";
export const AGENT_ID = process.env.FASTAPI_AGENT_ID ?? "yuri";

export type WsMsg = Record<string, unknown> & { type: string };

export function hasMsgOfType(msgs: WsMsg[], type: string): boolean {
  return msgs.some((m) => m.type === type);
}

export function findMsg(msgs: WsMsg[], type: string): WsMsg | undefined {
  return msgs.find((m) => m.type === type);
}

/** Collect messages until predicate returns true, or timeout. Auto-replies to ping. */
export function collectMessages(
  ws: WebSocket,
  predicate: (msgs: WsMsg[]) => boolean,
  timeoutMs = 5000,
): Promise<WsMsg[]> {
  return new Promise((resolve, reject) => {
    const msgs: WsMsg[] = [];
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timeout after ${timeoutMs}ms. Collected: ${JSON.stringify(msgs)}`,
        ),
      );
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as WsMsg;
      if (msg.type === "ping" && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      msgs.push(msg);
      if (predicate(msgs)) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve(msgs);
      }
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error while collecting messages`));
    });
  });
}

export function openWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () =>
      reject(new Error(`Failed to connect to ${WS_URL}`)),
    );
  });
}

export async function authorizedWs(): Promise<{ ws: WebSocket; connectionId: string }> {
  const ws = await openWs();
  const collected = collectMessages(
    ws,
    (msgs) => hasMsgOfType(msgs, "authorize_success"),
    5000,
  );
  ws.send(JSON.stringify({ type: "authorize", token: TOKEN }));
  const msgs = await collected;
  const msg = findMsg(msgs, "authorize_success") as { connection_id: string } & WsMsg;
  return { ws, connectionId: msg.connection_id };
}

/** Wait until ws.readyState === WebSocket.CLOSED */
export function waitForClose(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for WS close")),
      timeoutMs,
    );
    ws.addEventListener("close", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Send a complete chat turn and return session_id + response content. */
export async function sendChatTurn(
  content: string,
  sessionId?: string,
): Promise<{ sessionId: string; responseContent: string }> {
  const { ws } = await authorizedWs();
  const chatDone = collectMessages(
    ws,
    (msgs) => hasMsgOfType(msgs, "stream_end"),
    60_000,
  );
  ws.send(
    JSON.stringify({
      type: "chat_message",
      content,
      user_id: USER_ID,
      agent_id: AGENT_ID,
      tts_enabled: false,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  );
  const msgs = await chatDone;
  ws.close();
  const streamEnd = findMsg(msgs, "stream_end") as {
    session_id: string;
    content: string;
  } & WsMsg;
  return { sessionId: streamEnd.session_id, responseContent: streamEnd.content };
}
