import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { applyConfigToDisk, loadConfigFrom, type Config, type UpdateConfigInput } from "../../src/config-io.js";

const tempFiles: string[] = [];

function makeTempPath(): string {
  const path = join(tmpdir(), `config-io-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
  tempFiles.push(path);
  return path;
}

function baseConfig(): Config {
  return {
    fastapi: {
      ws_url: "ws://localhost:5500/ws",
      rest_url: "http://localhost:5500",
      token: "old-token",
      user_id: "old-user",
      agent_id: "old-agent",
    },
    homunculus: { api_url: "http://localhost:3100" },
    tts: { reference_id: "old-ref" },
  };
}

function baseInput(): UpdateConfigInput {
  return {
    user_id: "new-user",
    agent_id: "new-agent",
    fastapi_rest_url: "http://localhost:5500",
    fastapi_ws_url: "ws://localhost:5500/ws",
    fastapi_token: "new-token",
    homunculus_api_url: "http://localhost:3100",
    tts_reference_id: "new-ref",
  };
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    if (existsSync(f)) rmSync(f);
  }
});

describe("applyConfigToDisk", () => {
  it("TC-1: writes all 7 fields to a temp file", () => {
    const configPath = makeTempPath();
    const config = baseConfig();
    const input = baseInput();

    applyConfigToDisk(config, input, configPath);

    const result = loadConfigFrom(configPath);
    expect(result.fastapi.user_id).toBe("new-user");
    expect(result.fastapi.agent_id).toBe("new-agent");
    expect(result.fastapi.rest_url).toBe("http://localhost:5500");
    expect(result.fastapi.ws_url).toBe("ws://localhost:5500/ws");
    expect(result.fastapi.token).toBe("new-token");
    expect(result.homunculus.api_url).toBe("http://localhost:3100");
    expect(result.tts.reference_id).toBe("new-ref");
  });

  it("TC-2: loadConfigFrom round-trip preserves all fields", () => {
    const configPath = makeTempPath();
    const config = baseConfig();
    const input = baseInput();

    applyConfigToDisk(config, input, configPath);
    const roundTripped = loadConfigFrom(configPath);

    expect(roundTripped).toEqual({
      fastapi: {
        ws_url: "ws://localhost:5500/ws",
        rest_url: "http://localhost:5500",
        token: "new-token",
        user_id: "new-user",
        agent_id: "new-agent",
      },
      homunculus: { api_url: "http://localhost:3100" },
      tts: { reference_id: "new-ref" },
    });
  });

  it("TC-3: preserves untouched fields (in-memory mutation)", () => {
    const configPath = makeTempPath();
    const config = baseConfig();
    const input: UpdateConfigInput = {
      ...baseInput(),
      user_id: "updated-user",
    };

    applyConfigToDisk(config, input, configPath);

    // In-memory config object should be mutated
    expect(config.fastapi.user_id).toBe("updated-user");
    // Other fields should remain from baseConfig
    expect(config.fastapi.ws_url).toBe("ws://localhost:5500/ws");
    expect(config.homunculus.api_url).toBe("http://localhost:3100");
  });

  it("TC-4: empty string token is valid and written as empty string", () => {
    const configPath = makeTempPath();
    const config = baseConfig();
    const input: UpdateConfigInput = { ...baseInput(), fastapi_token: "" };

    applyConfigToDisk(config, input, configPath);

    const result = loadConfigFrom(configPath);
    expect(result.fastapi.token).toBe("");
  });

  it("TC-5: applyConfigToDisk is idempotent (write twice → same result)", () => {
    const configPath = makeTempPath();
    const config1 = baseConfig();
    const config2 = baseConfig();
    const input = baseInput();

    applyConfigToDisk(config1, input, configPath);
    const first = loadConfigFrom(configPath);

    applyConfigToDisk(config2, input, configPath);
    const second = loadConfigFrom(configPath);

    expect(first).toEqual(second);
  });
});
