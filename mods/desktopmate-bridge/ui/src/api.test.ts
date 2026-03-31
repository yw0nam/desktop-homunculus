import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ConnectionStatus, DmConfig } from "./types";

vi.mock("@hmcs/sdk/rpc", () => ({
  rpc: {
    call: vi.fn(),
  },
}));

import { rpc } from "@hmcs/sdk/rpc";
import { getStatus, listWindows, captureScreen, captureWindow } from "./api";

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

describe("api — listWindows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls rpc with listWindows method", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce([]);
    await listWindows();
    expect(rpc.call).toHaveBeenCalledWith({
      modName: "@hmcs/desktopmate-bridge",
      method: "listWindows",
    });
  });

  it("returns window list from rpc response", async () => {
    const windows = [
      { id: 1, title: "VSCode", appName: "Code" },
      { id: 2, title: "Terminal", appName: "iTerm2" },
    ];
    vi.mocked(rpc.call).mockResolvedValueOnce(windows);
    const result = await listWindows();
    expect(result).toEqual(windows);
  });
});

describe("api — captureScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls rpc with captureScreen method", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce("base64data");
    await captureScreen();
    expect(rpc.call).toHaveBeenCalledWith({
      modName: "@hmcs/desktopmate-bridge",
      method: "captureScreen",
    });
  });

  it("returns base64 string from rpc response", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce("abc123base64");
    const result = await captureScreen();
    expect(result).toBe("abc123base64");
  });
});

describe("api — captureWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls rpc with captureWindow method and windowId", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce("base64data");
    await captureWindow(42);
    expect(rpc.call).toHaveBeenCalledWith({
      modName: "@hmcs/desktopmate-bridge",
      method: "captureWindow",
      body: { windowId: 42 },
    });
  });

  it("returns base64 string for the captured window", async () => {
    vi.mocked(rpc.call).mockResolvedValueOnce("windowbase64");
    const result = await captureWindow(7);
    expect(result).toBe("windowbase64");
  });
});
