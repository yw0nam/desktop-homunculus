/**
 * E2E tests for session management: REST API shape validation and session continuity.
 *
 * Prerequisites:
 *   Backend: uvicorn src.main:app --port 5500  (in backend/)
 *
 * Run:
 *   pnpm test:e2e
 */
import { describe, it, expect } from "vitest";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:5500";
const WS_URL = FASTAPI_URL.replace(/^http/, "ws") + "/v1/chat/stream";
const TOKEN = process.env.FASTAPI_TOKEN ?? "test_token";
const USER_ID = process.env.FASTAPI_USER_ID ?? "default";
const AGENT_ID = process.env.FASTAPI_AGENT_ID ?? "yuri";

// ── REST helpers ──────────────────────────────────────────────────────────────

async function getSessions() {
  const res = await fetch(
    `${FASTAPI_URL}/v1/stm/sessions?user_id=${USER_ID}&agent_id=${AGENT_ID}`,
  );
  expect(res.ok).toBe(true);
  return res.json() as Promise<{
    sessions: { session_id: string; created_at: string; updated_at: string; metadata: Record<string, unknown> }[];
  }>;
}

async function getChatHistory(sessionId: string) {
  const res = await fetch(
    `${FASTAPI_URL}/v1/stm/get-chat-history?session_id=${sessionId}&user_id=${USER_ID}&agent_id=${AGENT_ID}`,
  );
  expect(res.ok).toBe(true);
  return res.json() as Promise<{
    session_id: string;
    messages: { role: string; content: unknown }[];
  }>;
}

// ── WebSocket helpers ─────────────────────────────────────────────────────────

type WsMsg = Record<string, unknown> & { type: string };

function collectUntil(
  ws: WebSocket,
  predicate: (msgs: WsMsg[]) => boolean,
  timeoutMs: number,
): Promise<WsMsg[]> {
  return new Promise((resolve, reject) => {
    const msgs: WsMsg[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Timeout. Collected: ${JSON.stringify(msgs)}`)),
      timeoutMs,
    );
    const onMsg = (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string) as WsMsg;
      if (msg.type === "ping" && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      msgs.push(msg);
      if (predicate(msgs)) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        resolve(msgs);
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

async function sendChatTurn(
  content: string,
  sessionId?: string,
): Promise<{ sessionId: string; responseContent: string }> {
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", () => rej(new Error("WS open failed")));
  });

  // authorize
  const authDone = collectUntil(
    ws,
    (msgs) => msgs.some((m) => m.type === "authorize_success"),
    5000,
  );
  ws.send(JSON.stringify({ type: "authorize", token: TOKEN }));
  await authDone;

  // chat
  const chatDone = collectUntil(
    ws,
    (msgs) => msgs.some((m) => m.type === "stream_end"),
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

  const streamEnd = msgs.find((m) => m.type === "stream_end") as {
    session_id: string;
    content: string;
  } & WsMsg;
  return {
    sessionId: streamEnd.session_id,
    responseContent: streamEnd.content,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("REST API response shape", () => {
  it("GET /v1/stm/sessions returns { sessions: [...] } wrapper (not a bare array)", async () => {
    const data = await getSessions();
    expect(data).toHaveProperty("sessions");
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it("each session has session_id, created_at, updated_at, metadata fields", async () => {
    const { sessions } = await getSessions();
    if (sessions.length === 0) return; // no sessions yet — skip shape check
    const s = sessions[0];
    expect(s).toHaveProperty("session_id");
    expect(s).toHaveProperty("created_at");
    expect(s).toHaveProperty("updated_at");
    expect(s).toHaveProperty("metadata");
    expect(s).not.toHaveProperty("name"); // name lives in metadata, NOT top-level
  });

  it(
    "GET /v1/stm/get-chat-history returns { session_id, messages: [...] } wrapper",
    async () => {
      // Create a session first
      const { sessionId } = await sendChatTurn("Hi, one word reply please.");
      const data = await getChatHistory(sessionId);
      expect(data).toHaveProperty("session_id", sessionId);
      expect(data).toHaveProperty("messages");
      expect(Array.isArray(data.messages)).toBe(true);
      expect(data.messages.length).toBeGreaterThan(0);
      const msg = data.messages[0];
      expect(msg).toHaveProperty("role");
      expect(msg).toHaveProperty("content");
    },
    65_000,
  );
});

describe("Session creation and continuity", () => {
  it(
    "stream_end includes a session_id (backend creates new session when none provided)",
    async () => {
      const { sessionId } = await sendChatTurn("Hello.");
      expect(sessionId).toBeTruthy();
    },
    65_000,
  );

  it(
    "second message with same session_id continues the same session",
    async () => {
      const { sessionId: sid1 } = await sendChatTurn("My name is TestUser. Remember it.");
      const { sessionId: sid2 } = await sendChatTurn("What is my name?", sid1);
      expect(sid2).toBe(sid1); // same session
    },
    130_000,
  );

  it(
    "session appears in GET /v1/stm/sessions after a chat turn",
    async () => {
      const { sessionId } = await sendChatTurn("Ping.");
      // save_turn is a background task — retry for up to 5 seconds
      let found: unknown;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { sessions } = await getSessions();
        found = sessions.find((s) => s.session_id === sessionId);
        if (found) break;
      }
      expect(found).toBeDefined();
    },
    70_000,
  );
});
