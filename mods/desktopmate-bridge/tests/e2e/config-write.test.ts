/**
 * E2E tests for config file I/O via applyConfigToDisk / loadConfigFrom.
 * E2E: most tests require no FastAPI backend.
 * EXCEPTION: TC-CW-07 requires FastAPI at FASTAPI_URL (http://localhost:5500)
 * Uses temporary files (os.tmpdir()) — real config.yaml is NEVER touched.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyConfigToDisk,
  loadConfigFrom,
  type Config,
  type UpdateConfigInput,
} from "../../src/config-io.js";
import {
  FASTAPI_URL,
  WS_URL,
  USER_ID,
  AGENT_ID,
  authorizedWs,
  collectMessages,
  hasMsgOfType,
} from "./helpers/ws.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_CONFIG_PATH = resolve(__dirname, "../../config.yaml");

let tmpPath: string;

beforeEach(() => {
  tmpPath = join(
    tmpdir(),
    `config-write-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  );
  copyFileSync(REAL_CONFIG_PATH, tmpPath);
});

afterEach(() => {
  if (existsSync(tmpPath)) rmSync(tmpPath);
});

function loadTmp(): Config {
  return loadConfigFrom(tmpPath);
}

function baseInput(overrides: Partial<UpdateConfigInput> = {}): UpdateConfigInput {
  const cfg = loadTmp();
  return {
    user_id: cfg.fastapi.user_id,
    agent_id: cfg.fastapi.agent_id,
    fastapi_rest_url: cfg.fastapi.rest_url,
    fastapi_ws_url: cfg.fastapi.ws_url,
    fastapi_token: cfg.fastapi.token,
    homunculus_api_url: cfg.homunculus.api_url,
    tts_reference_id: cfg.tts.reference_id,
    ...overrides,
  };
}

describe("TC-CW-01: 기본 config.yaml 쓰기", () => {
  it("writes user_id and agent_id to temp file", () => {
    const config = loadTmp();
    const input = baseInput({ user_id: "test-user", agent_id: "test-agent" });

    applyConfigToDisk(config, input, tmpPath);

    const result = loadTmp();
    expect(result.fastapi.user_id).toBe("test-user");
    expect(result.fastapi.agent_id).toBe("test-agent");
  });
});

describe("TC-CW-02: 수정하지 않은 필드 보존", () => {
  it("unchanged fields remain after user_id-only update", () => {
    const config = loadTmp();
    const originalAgentId = config.fastapi.agent_id;
    const originalWsUrl = config.fastapi.ws_url;
    const originalRestUrl = config.fastapi.rest_url;
    const originalToken = config.fastapi.token;
    const originalApiUrl = config.homunculus.api_url;
    const originalTtsRef = config.tts.reference_id;

    const input = baseInput({ user_id: "changed-user" });
    applyConfigToDisk(config, input, tmpPath);

    const result = loadTmp();
    expect(result.fastapi.agent_id).toBe(originalAgentId);
    expect(result.fastapi.ws_url).toBe(originalWsUrl);
    expect(result.fastapi.rest_url).toBe(originalRestUrl);
    expect(result.fastapi.token).toBe(originalToken);
    expect(result.homunculus.api_url).toBe(originalApiUrl);
    expect(result.tts.reference_id).toBe(originalTtsRef);
  });
});

describe("TC-CW-03: config round-trip — 쓰기 후 loadConfigFrom 일치", () => {
  it("all Config interface fields survive a write → read round-trip", () => {
    const config = loadTmp();
    const input = baseInput({
      user_id: "rt-user",
      agent_id: "rt-agent",
      fastapi_ws_url: "ws://rt-host:5500/v1/chat/stream",
      fastapi_rest_url: "http://rt-host:5500",
      fastapi_token: "rt-token",
      homunculus_api_url: "http://rt-homunculus:3100",
      tts_reference_id: "rt-ref",
    });

    applyConfigToDisk(config, input, tmpPath);

    const result = loadTmp();
    expect(result).toMatchObject({
      fastapi: {
        user_id: "rt-user",
        agent_id: "rt-agent",
        ws_url: "ws://rt-host:5500/v1/chat/stream",
        rest_url: "http://rt-host:5500",
        token: "rt-token",
      },
      homunculus: { api_url: "http://rt-homunculus:3100" },
      tts: { reference_id: "rt-ref" },
    });
  });
});

describe("TC-CW-04: 빈 token 필드 처리", () => {
  it("empty string token is written and read back as empty string (not null/undefined)", () => {
    const config = loadTmp();
    const input = baseInput({ fastapi_token: "" });

    applyConfigToDisk(config, input, tmpPath);

    const result = loadTmp();
    expect(result.fastapi.token).toBe("");
    expect(result.fastapi.token).not.toBeNull();
    expect(result.fastapi.token).not.toBeUndefined();
  });
});

describe("TC-CW-05: 멱등성 — 동일 값 두 번 쓰기", () => {
  it("writing the same input twice produces identical config", () => {
    const config1 = loadTmp();
    const input = baseInput({ user_id: "idempotent-user" });

    applyConfigToDisk(config1, input, tmpPath);
    const after1 = loadTmp();

    const config2 = loadTmp();
    applyConfigToDisk(config2, input, tmpPath);
    const after2 = loadTmp();

    expect(after2).toMatchObject({
      fastapi: after1.fastapi,
      homunculus: after1.homunculus,
      tts: after1.tts,
    });
  });
});

describe("TC-CW-06: 새 WS URL이 loadConfigFrom에 반영됨", () => {
  it("updated ws_url is returned by loadConfigFrom (reconnect precondition)", () => {
    const config = loadTmp();
    const newWsUrl = "ws://new-host:9999/v1/chat/stream";
    const input = baseInput({ fastapi_ws_url: newWsUrl });

    applyConfigToDisk(config, input, tmpPath);

    const result = loadTmp();
    expect(result.fastapi.ws_url).toBe(newWsUrl);
  });
});

describe("TC-CW-07: 파일 쓰기 후 실제 연결 (config round-trip + WS 연결)", () => {
  it(
    "config write → read → WS connect → chat completes",
    async () => {
      // Load current config and write it back (same values)
      const config = loadTmp();
      const input = baseInput();
      applyConfigToDisk(config, input, tmpPath);

      // Verify the ws_url from the written config
      const writtenConfig = loadTmp();
      expect(writtenConfig.fastapi.ws_url).toBeTruthy();

      // Connect using the actual backend WS URL
      const { ws } = await authorizedWs();
      try {
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
        expect(hasMsgOfType(msgs, "stream_end")).toBe(true);
      } finally {
        ws.close();
      }
    },
    65_000,
  );
});
