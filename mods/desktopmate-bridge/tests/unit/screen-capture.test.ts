import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Image } from "node-screenshots";

const mockPngBuffer = Buffer.from("fake-png-data");

const mockImage: Partial<Image> = {
  toPng: vi.fn(async () => mockPngBuffer),
};

const mockWindows = [
  { id: vi.fn(() => 1), title: vi.fn(() => "Window One"), captureImage: vi.fn(async () => mockImage as Image) },
  { id: vi.fn(() => 2), title: vi.fn(() => "Window Two"), captureImage: vi.fn(async () => mockImage as Image) },
];

const mockMonitor = {
  isPrimary: vi.fn(() => true),
  captureImage: vi.fn(async () => mockImage as Image),
};

vi.mock("node-screenshots", () => ({
  Window: {
    all: vi.fn(() => mockWindows),
  },
  Monitor: {
    all: vi.fn(() => [mockMonitor]),
  },
}));

import { listWindows, captureScreen, captureWindow } from "../../screen-capture.js";

describe("listWindows", () => {
  it("returns id and title for each window", async () => {
    const result = await listWindows();
    expect(result).toEqual([
      { id: "1", title: "Window One" },
      { id: "2", title: "Window Two" },
    ]);
  });
});

describe("captureScreen", () => {
  it("returns base64 string from primary monitor", async () => {
    const result = await captureScreen();
    expect(result.base64).toBe(mockPngBuffer.toString("base64"));
  });
});

describe("captureWindow", () => {
  it("returns base64 string for matched window id", async () => {
    const result = await captureWindow("1");
    expect(result.base64).toBe(mockPngBuffer.toString("base64"));
  });

  it("throws when window id not found", async () => {
    await expect(captureWindow("999")).rejects.toThrow("Window not found: 999");
  });
});
