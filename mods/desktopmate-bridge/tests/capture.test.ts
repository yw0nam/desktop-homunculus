import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node-screenshots", () => ({
  Monitor: { all: vi.fn() },
  Window: { all: vi.fn() },
}));

vi.mock("sharp", () => {
  const chain = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-jpeg")),
  };
  return { default: vi.fn(() => chain) };
});

import { Monitor, Window } from "node-screenshots";
import sharp from "sharp";
import { listWindows, captureScreen, captureWindow } from "../capture.js";

function makeWindow(overrides: Partial<{
  id: number; title: string; appName: string;
  isMinimized: boolean; width: number; height: number;
  captureImage: () => Promise<{ toPng: () => Promise<Buffer> }>;
}> = {}) {
  return {
    id: () => overrides.id ?? 1,
    title: () => overrides.title ?? "Test Window",
    appName: () => overrides.appName ?? "TestApp",
    isMinimized: () => overrides.isMinimized ?? false,
    width: () => overrides.width ?? 800,
    height: () => overrides.height ?? 600,
    captureImage: overrides.captureImage ?? (() => Promise.resolve({
      toPng: () => Promise.resolve(Buffer.from("fake-png")),
    })),
  };
}

function makeMonitor(overrides: Partial<{
  isPrimary: boolean;
  captureImage: () => Promise<{ toPng: () => Promise<Buffer> }>;
}> = {}) {
  return {
    isPrimary: () => overrides.isPrimary ?? true,
    captureImage: overrides.captureImage ?? (() => Promise.resolve({
      toPng: () => Promise.resolve(Buffer.from("fake-png")),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const chain = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-jpeg")),
  };
  vi.mocked(sharp).mockReturnValue(chain as ReturnType<typeof sharp>);
});

describe("listWindows", () => {
  it("returns id, title, appName for each window", () => {
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({ id: 1, title: "Editor", appName: "VSCode" }),
      makeWindow({ id: 2, title: "Browser", appName: "Chrome" }),
    ] as ReturnType<typeof Window.all>);

    const result = listWindows();

    expect(result).toEqual([
      { id: 1, title: "Editor", appName: "VSCode" },
      { id: 2, title: "Browser", appName: "Chrome" },
    ]);
  });

  it("returns empty array when no windows", () => {
    vi.mocked(Window.all).mockReturnValue([]);
    expect(listWindows()).toEqual([]);
  });
});

describe("captureScreen", () => {
  it("captures primary monitor and returns base64 JPEG", async () => {
    const png = Buffer.from("fake-png");
    vi.mocked(Monitor.all).mockReturnValue([
      makeMonitor({ isPrimary: false }),
      makeMonitor({
        isPrimary: true,
        captureImage: () => Promise.resolve({ toPng: () => Promise.resolve(png) }),
      }),
    ] as ReturnType<typeof Monitor.all>);

    const result = await captureScreen();

    expect(sharp).toHaveBeenCalledWith(png);
    const sharpInstance = vi.mocked(sharp).mock.results[0].value as ReturnType<typeof sharp>;
    expect(sharpInstance.resize).toHaveBeenCalledWith(1920, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    });
    expect(sharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });
    expect(result).toBe(Buffer.from("fake-jpeg").toString("base64"));
  });

  it("falls back to first monitor if no primary", async () => {
    vi.mocked(Monitor.all).mockReturnValue([
      makeMonitor({ isPrimary: false }),
    ] as ReturnType<typeof Monitor.all>);

    await captureScreen();

    expect(sharp).toHaveBeenCalled();
  });

  it("throws if no monitors available", async () => {
    vi.mocked(Monitor.all).mockReturnValue([]);
    await expect(captureScreen()).rejects.toThrow("No monitor found");
  });
});

describe("captureWindow", () => {
  it("captures window by id and returns base64 JPEG", async () => {
    const png = Buffer.from("fake-png");
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({
        id: 42,
        captureImage: () => Promise.resolve({ toPng: () => Promise.resolve(png) }),
      }),
    ] as ReturnType<typeof Window.all>);

    const result = await captureWindow(42);

    expect(sharp).toHaveBeenCalledWith(png);
    expect(result).toBe(Buffer.from("fake-jpeg").toString("base64"));
  });

  it("throws if window not found", async () => {
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({ id: 1 }),
    ] as ReturnType<typeof Window.all>);

    await expect(captureWindow(999)).rejects.toThrow("Window not found: 999");
  });

  it("throws if window is minimized", async () => {
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({ id: 5, isMinimized: true }),
    ] as ReturnType<typeof Window.all>);

    await expect(captureWindow(5)).rejects.toThrow("Window is minimized: 5");
  });

  it("throws if window has zero width", async () => {
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({ id: 7, width: 0, height: 600 }),
    ] as ReturnType<typeof Window.all>);

    await expect(captureWindow(7)).rejects.toThrow("Window has invalid dimensions: 7");
  });

  it("throws if window has zero height", async () => {
    vi.mocked(Window.all).mockReturnValue([
      makeWindow({ id: 8, width: 800, height: 0 }),
    ] as ReturnType<typeof Window.all>);

    await expect(captureWindow(8)).rejects.toThrow("Window has invalid dimensions: 8");
  });
});
