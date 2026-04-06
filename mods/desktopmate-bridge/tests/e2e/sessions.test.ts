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
import { FASTAPI_URL, USER_ID, AGENT_ID, sendChatTurn } from "./helpers/ws.js";

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
