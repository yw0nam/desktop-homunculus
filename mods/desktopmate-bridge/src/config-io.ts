import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";

export interface Config {
  fastapi: {
    ws_url: string;
    rest_url: string;
    token: string;
    user_id: string;
    agent_id: string;
  };
  homunculus: {
    api_url: string;
  };
  tts: {
    reference_id: string;
  };
}

export interface UpdateConfigInput {
  user_id: string;
  agent_id: string;
  fastapi_rest_url: string;
  fastapi_ws_url: string;
  fastapi_token: string;
  homunculus_api_url: string;
  tts_reference_id: string;
}

/**
 * Mutates `config` in-place with `input` values, then writes the result to `configPath`.
 * Pass a temp file path in tests to avoid touching the real config.yaml.
 */
export function applyConfigToDisk(
  config: Config,
  input: UpdateConfigInput,
  configPath: string,
): void {
  config.fastapi.user_id = input.user_id;
  config.fastapi.agent_id = input.agent_id;
  config.fastapi.rest_url = input.fastapi_rest_url;
  config.fastapi.ws_url = input.fastapi_ws_url;
  config.fastapi.token = input.fastapi_token;
  config.homunculus.api_url = input.homunculus_api_url;
  config.tts.reference_id = input.tts_reference_id;
  writeFileSync(configPath, yaml.dump(config), "utf-8");
}

/**
 * Reads and parses a YAML config file at `configPath`.
 * Throws if the file is empty or not a valid YAML object.
 */
export function loadConfigFrom(configPath: string): Config {
  const parsed = yaml.load(readFileSync(configPath, "utf-8"));
  if (parsed === null || parsed === undefined || typeof parsed !== "object") {
    throw new Error(`Invalid config at ${configPath}: expected a YAML object, got ${String(parsed)}`);
  }
  return parsed as Config;
}
