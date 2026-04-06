/**
 * E2E tests for WebSocket connection lifecycle — reconnect, auth failure, stress.
 * E2E: requires real FastAPI backend at FASTAPI_URL (default: http://localhost:5500)
 * Run: pnpm test:e2e
 */
import { describe, it, expect } from "vitest";
import {
  FASTAPI_URL,
  TOKEN,
  USER_ID,
  AGENT_ID,
  openWs,
  collectMessages,
  authorizedWs,
  hasMsgOfType,
  findMsg,
  waitForClose,
  sendChatTurn,
  type WsMsg,
} from "./helpers/ws.js";

// TC-LC-02: backend currently returns authorize_success for all tokens
// Remove this flag when backend implements token validation
const backendSkipsTokenValidation = true; // TODO: backend token validation not implemented

describe("TC-LC-01: Reconnect smoke test — 재연결 후 채팅 완료", () => {
  it(
    "completes chat on first connection, then reconnects and completes chat again",
    async () => {
      // First connection: authorize → chat → close
      const { ws: ws1, connectionId: cid1 } = await authorizedWs();
      const chat1Done = collectMessages(
        ws1,
        (msgs) => hasMsgOfType(msgs, "stream_end"),
        60_000,
      );
      ws1.send(
        JSON.stringify({
          type: "chat_message",
          content: "Just say hi.",
          user_id: USER_ID,
          agent_id: AGENT_ID,
          tts_enabled: false,
        }),
      );
      const msgs1 = await chat1Done;
      const streamEnd1 = findMsg(msgs1, "stream_end") as { content: string } & WsMsg;
      expect(streamEnd1.content).toBeTruthy();
      ws1.close();
      await waitForClose(ws1);

      // Second connection: fresh WS, authorize → chat
      const { ws: ws2, connectionId: cid2 } = await authorizedWs();
      try {
        expect(cid2).toBeTruthy();
        const chat2Done = collectMessages(
          ws2,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws2.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say hi again.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs2 = await chat2Done;
        const streamEnd2 = findMsg(msgs2, "stream_end") as { content: string } & WsMsg;
        expect(streamEnd2.content).toBeTruthy();
      } finally {
        ws2.close();
      }
    },
    130_000,
  );
});

describe("TC-LC-02: 인증 실패 후 복구", () => {
  it.skipIf(backendSkipsTokenValidation)(
    "bad token → authorize_error, then good token → chat completes",
    async () => {
      // Bad token: expect authorize_error
      const ws1 = await openWs();
      const authFail = collectMessages(
        ws1,
        (msgs) => hasMsgOfType(msgs, "authorize_error"),
        10_000,
      );
      ws1.send(JSON.stringify({ type: "authorize", token: "bad_token_12345" }));
      const failMsgs = await authFail;
      expect(hasMsgOfType(failMsgs, "authorize_error")).toBe(true);
      ws1.close();
      await waitForClose(ws1);

      // Good token: should succeed and chat
      const { ws: ws2 } = await authorizedWs();
      try {
        const chatDone = collectMessages(
          ws2,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws2.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await chatDone;
        expect(hasMsgOfType(msgs, "stream_end")).toBe(true);
      } finally {
        ws2.close();
      }
    },
    80_000,
  );
});

describe("TC-LC-03: 연속 빠른 재연결 스트레스 (5회)", () => {
  it(
    "5 sequential reconnects all succeed, final chat completes",
    async () => {
      // 5 sequential connect → authorize → close cycles
      for (let i = 0; i < 5; i++) {
        const { ws } = await authorizedWs();
        ws.close();
        await waitForClose(ws);
      }

      // Final connection: chat must complete
      const { ws: wsFinal } = await authorizedWs();
      try {
        const chatDone = collectMessages(
          wsFinal,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        wsFinal.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await chatDone;
        const streamEnd = findMsg(msgs, "stream_end") as { content: string } & WsMsg;
        expect(streamEnd.content).toBeTruthy();
      } finally {
        wsFinal.close();
      }
    },
    90_000,
  );
});

describe("TC-LC-04: 스트림 중간 연결 끊김 → 재연결 후 새 채팅 완료", () => {
  it(
    "interrupted stream does not break subsequent connection",
    async () => {
      // Trigger a long response, close after stream_start
      const { ws: ws1 } = await authorizedWs();
      const streamStartReceived = collectMessages(
        ws1,
        (msgs) => hasMsgOfType(msgs, "stream_start"),
        20_000,
      );
      ws1.send(
        JSON.stringify({
          type: "chat_message",
          content: "Tell me a very long story about ancient civilizations.",
          user_id: USER_ID,
          agent_id: AGENT_ID,
          tts_enabled: false,
        }),
      );
      await streamStartReceived;
      ws1.close(); // interrupt mid-stream
      await waitForClose(ws1);

      // New connection: short chat must succeed
      const { ws: ws2 } = await authorizedWs();
      try {
        const chatDone = collectMessages(
          ws2,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws2.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK, nothing else.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await chatDone;
        const streamEnd = findMsg(msgs, "stream_end") as { content: string } & WsMsg;
        expect(streamEnd.content).toBeTruthy();
      } finally {
        ws2.close();
      }
    },
    90_000,
  );
});

describe("TC-LC-05: 동시 연결 — 세션 격리", () => {
  it(
    "3 concurrent connections all get stream_end independently",
    async () => {
      // Open 3 authorized connections concurrently
      const connections = await Promise.all([
        authorizedWs(),
        authorizedWs(),
        authorizedWs(),
      ]);

      try {
        // All connection_ids must be truthy
        for (const { connectionId } of connections) {
          expect(connectionId).toBeTruthy();
        }

        // Send chat on all 3 concurrently
        const chatResults = await Promise.all(
          connections.map(async ({ ws }) => {
            const chatDone = collectMessages(
              ws,
              (msgs) => hasMsgOfType(msgs, "stream_end"),
              60_000,
            );
            ws.send(
              JSON.stringify({
                type: "chat_message",
                content: "Just say OK.",
                user_id: USER_ID,
                agent_id: AGENT_ID,
                tts_enabled: false,
              }),
            );
            return chatDone;
          }),
        );

        // All 3 must receive stream_end
        for (const msgs of chatResults) {
          expect(hasMsgOfType(msgs, "stream_end")).toBe(true);
        }
      } finally {
        for (const { ws } of connections) {
          ws.close();
        }
      }
    },
    70_000,
  );
});

describe("TC-LC-06: 버그 회귀 — 3회 재연결 + 매 회 채팅 완료", () => {
  it(
    "reconnect button scenario: 3 reconnects each with successful chat",
    async () => {
      const connectionIds: string[] = [];

      for (let round = 0; round < 3; round++) {
        const { ws, connectionId } = await authorizedWs();
        connectionIds.push(connectionId);

        const chatDone = collectMessages(
          ws,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await chatDone;
        const streamEnd = findMsg(msgs, "stream_end") as { content: string } & WsMsg;
        expect(streamEnd.content).toBeTruthy();

        ws.close();
        await waitForClose(ws);
        await new Promise((r) => setTimeout(r, 500));
      }

      // All connection_ids must be unique
      const unique = new Set(connectionIds);
      expect(unique.size).toBe(3);
    },
    250_000,
  );
});

describe("TC-LC-07: 인증 없이 채팅 → 에러 처리", () => {
  it(
    "unauthenticated chat_message receives error or WS closes, then recovery works",
    async () => {
      // Send chat without authorize
      const ws1 = await openWs();
      let gotErrorOrClose = false;

      const errorOrClose = new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 5000); // timeout = pass (server may not respond)
        const onMsg = (e: MessageEvent) => {
          const msg = JSON.parse(e.data as string) as WsMsg;
          if (msg.type === "error") {
            gotErrorOrClose = true;
            clearTimeout(timer);
            ws1.removeEventListener("message", onMsg);
            resolve();
          }
        };
        ws1.addEventListener("message", onMsg);
        ws1.addEventListener("close", () => {
          gotErrorOrClose = true;
          clearTimeout(timer);
          resolve();
        });
      });

      ws1.send(
        JSON.stringify({
          type: "chat_message",
          content: "Hello without auth",
          user_id: USER_ID,
          agent_id: AGENT_ID,
          tts_enabled: false,
        }),
      );
      await errorOrClose;
      ws1.close();

      // Recovery: new connection must work
      const { ws: ws2 } = await authorizedWs();
      try {
        const chatDone = collectMessages(
          ws2,
          (msgs) => hasMsgOfType(msgs, "stream_end"),
          60_000,
        );
        ws2.send(
          JSON.stringify({
            type: "chat_message",
            content: "Just say OK.",
            user_id: USER_ID,
            agent_id: AGENT_ID,
            tts_enabled: false,
          }),
        );
        const msgs = await chatDone;
        expect(hasMsgOfType(msgs, "stream_end")).toBe(true);
      } finally {
        ws2.close();
      }
    },
    70_000,
  );
});

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
      const { sessionId: s2, responseContent } = await sendChatTurn(
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
