import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ConnectionStatus, DmConfig } from "./types";

vi.mock("@hmcs/sdk/rpc", () => ({
  rpc: {
    call: vi.fn(),
  },
}));

import { rpc } from "@hmcs/sdk/rpc";
import { getStatus } from "./api";

const mockConfig: DmConfig = {
  user_id: "alice",
  agent_id: "yuri",
  fastapi_rest_url: "http://localhost:5500",
  fastapi_ws_url: "ws://localhost:5500/v1/chat/stream",
  fastapi_token: "tok",
  homunculus_api_url: "http://localhost:3100",
  tts_reference_id: "speaker_001",
};

describe("api — getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls rpc with correct modName and method", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce({ status: "connected", config: mockConfig });
    await getStatus();
    expect(rpc.call).toHaveBeenCalledWith({
      modName: "@hmcs/desktopmate-bridge",
      method: "getStatus",
    });
  });

  it("returns status and config from rpc response", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce({
      status: "connected" as ConnectionStatus,
      config: mockConfig,
    });
    const result = await getStatus();
    expect(result.status).toBe("connected");
    expect(result.config).toEqual(mockConfig);
  });

  it("returns disconnected status when service reports disconnected", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce({
      status: "disconnected" as ConnectionStatus,
      config: mockConfig,
    });
    const result = await getStatus();
    expect(result.status).toBe("disconnected");
  });
});
