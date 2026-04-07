/**
 * E2E tests for WebSocket session continuity — STM persistence across reconnects.
 * E2E: requires real FastAPI backend at FASTAPI_URL (default: http://localhost:5500)
 * Run: pnpm test:e2e
 */
import { describe, it, expect } from "vitest";
import {
  FASTAPI_URL,
  USER_ID,
  AGENT_ID,
  sendChatTurn,
} from "./helpers/ws.js";

describe("TC-LC-08: 세션 연속성 — 재연결 후 기존 세션 복원", () => {
  it(
    "session persists across reconnect — STM continuity check",
    async () => {
      // First turn: create session S1
      const { sessionId: s1 } = await sendChatTurn("My name is ReconnectUser. Remember it.");

      // REST: wait for session to appear (save_turn is background task)
      let sessionFound = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = await fetch(
          `${FASTAPI_URL}/v1/stm/sessions?user_id=${USER_ID}&agent_id=${AGENT_ID}`,
        );
        const data = (await res.json()) as { sessions: { session_id: string }[] };
        if (data.sessions.some((s) => s.session_id === s1)) {
          sessionFound = true;
          break;
        }
      }
      expect(sessionFound).toBe(true);

      // Second turn: same session S1 on a new WS connection
      const { sessionId: s2 } = await sendChatTurn(
        "What is my name?",
        s1,
      );
      expect(s2).toBe(s1);

      // REST: verify chat history has messages
      const histRes = await fetch(
        `${FASTAPI_URL}/v1/stm/get-chat-history?session_id=${s1}&user_id=${USER_ID}&agent_id=${AGENT_ID}`,
      );
      const hist = (await histRes.json()) as {
        session_id: string;
        messages: { role: string; content: unknown }[];
      };
      expect(hist.session_id).toBe(s1);
      expect(hist.messages.length).toBeGreaterThan(0);
    },
    200_000,
  );
});
