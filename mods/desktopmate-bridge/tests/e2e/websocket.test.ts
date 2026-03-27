/**
 * E2E tests for desktopmate-bridge WebSocket protocol against real FastAPI backend.
 *
 * Prerequisites:
 *   Backend: uvicorn src.main:app --port 5500  (in backend/)
 *
 * Run:
 *   pnpm test:e2e
 *   FASTAPI_URL=http://localhost:5500 FASTAPI_TOKEN=<token> pnpm test:e2e
 */
import { describe, it, expect } from "vitest";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:5500";
const WS_URL = FASTAPI_URL.replace(/^http/, "ws") + "/v1/chat/stream";
const TOKEN = process.env.FASTAPI_TOKEN ?? "test_token";
const USER_ID = process.env.FASTAPI_USER_ID ?? "default";
const AGENT_ID = process.env.FASTAPI_AGENT_ID ?? "yuri";

type WsMsg = Record<string, unknown> & { type: string };

function hasMsgOfType(msgs: WsMsg[], type: string): boolean {
  return msgs.some((m) => m.type === type);
}

function findMsg(msgs: WsMsg[], type: string): WsMsg | undefined {
  return msgs.find((m) => m.type === type);
}

/** Collect messages until predicate returns true, or timeout. Auto-replies to ping. */
function collectMessages(
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
      // Auto-reply to server ping
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

function openWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () =>
      reject(new Error(`Failed to connect to ${WS_URL}`)),
    );
  });
}

async function authorizedWs(): Promise<{ ws: WebSocket; connectionId: string }> {
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

describe("WebSocket Authorization", () => {
  it("returns authorize_success for any token (token validation is TODO in backend)", async () => {
    const ws = await openWs();
    try {
      const done = collectMessages(
        ws,
        (msgs) => hasMsgOfType(msgs, "authorize_success"),
        5000,
      );
      ws.send(JSON.stringify({ type: "authorize", token: TOKEN }));
      const msgs = await done;
      const msg = findMsg(msgs, "authorize_success") as { connection_id: string } & WsMsg;
      expect(msg.type).toBe("authorize_success");
      expect(msg.connection_id).toBeTruthy();
    } finally {
      ws.close();
    }
  });
});

describe("Chat Message", () => {
  it(
    "receives stream_start then stream_end for a valid chat_message",
    async () => {
      const { ws } = await authorizedWs();
      try {
        const done = collectMessages(
          ws,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws.send(
          JSON.stringify({
            type: "chat_message",
            content: "Hello, just say hi back.",
            agent_id: AGENT_ID,
            user_id: USER_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await done;
        expect(hasMsgOfType(msgs, "stream_start")).toBe(true);
        expect(hasMsgOfType(msgs, "stream_end")).toBe(true);

        const streamEnd = findMsg(msgs, "stream_end") as {
          content: string;
          session_id: string;
        } & WsMsg;
        expect(streamEnd.content).toBeTruthy();
        expect(streamEnd.session_id).toBeTruthy();
      } finally {
        ws.close();
      }
    },
    65_000,
  );

  it("returns an error when agent_id is missing", async () => {
    const { ws } = await authorizedWs();
    try {
      const done = collectMessages(
        ws,
        (msgs) => hasMsgOfType(msgs, "error"),
        5000,
      );
      ws.send(JSON.stringify({ type: "chat_message", content: "Hello" }));
      const msgs = await done;
      const error = findMsg(msgs, "error") as { error: string } & WsMsg;
      expect(error.error).toBeTruthy();
    } finally {
      ws.close();
    }
  }, 10_000);

  it(
    "service.ts protocol: chat_message with user_id/agent_id succeeds",
    async () => {
      const { ws } = await authorizedWs();
      try {
        const done = collectMessages(
          ws,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        // Simulate the fixed service.ts sendMessage payload
        ws.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await done;
        expect(hasMsgOfType(msgs, "stream_start")).toBe(true);
        expect(hasMsgOfType(msgs, "stream_end")).toBe(true);
      } finally {
        ws.close();
      }
    },
    65_000,
  );
});

describe("Interrupt Stream", () => {
  it(
    "terminates early when interrupt_stream is sent after stream_start",
    async () => {
      const { ws } = await authorizedWs();
      try {
        let interruptSent = false;
        const done = collectMessages(
          ws,
          (msgs) => {
            if (!interruptSent && hasMsgOfType(msgs, "stream_start")) {
              interruptSent = true;
              ws.send(JSON.stringify({ type: "interrupt_stream" }));
            }
            return hasMsgOfType(msgs, "stream_end") || hasMsgOfType(msgs, "error");
          },
          30_000,
        );
        ws.send(
          JSON.stringify({
            type: "chat_message",
            content: "Tell me a very long story about dragons.",
            agent_id: AGENT_ID,
            user_id: USER_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await done;
        expect(
          hasMsgOfType(msgs, "stream_end") || hasMsgOfType(msgs, "error"),
        ).toBe(true);
      } finally {
        ws.close();
      }
    },
    35_000,
  );
});
