import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSetTransform, mockGetTransform, mockVrm, mockWebview } =
  vi.hoisted(() => {
    const mockSetTransform = vi.fn().mockResolvedValue(undefined);
    const mockGetTransform = vi.fn().mockResolvedValue({
      scale: [1, 1, 1] as [number, number, number],
      translation: [2.5, -1.0, 0.3] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    });
    const mockVrm = {
      entity: 42,
      persona: vi.fn().mockResolvedValue({
        profile: "test profile",
        personality: "friendly",
        ocean: {},
        metadata: {},
      }),
      name: vi.fn().mockResolvedValue("TestVRM"),
      setPersona: vi.fn().mockResolvedValue(undefined),
    };
    const mockWebview = {
      linkedVrm: vi.fn().mockResolvedValue(mockVrm),
      close: vi.fn(),
    };
    return { mockSetTransform, mockGetTransform, mockVrm, mockWebview };
  });

vi.mock("@hmcs/sdk", () => ({
  Webview: {
    current: vi.fn().mockReturnValue(mockWebview),
  },
  Vrm: {},
  entities: {
    transform: mockGetTransform,
    setTransform: mockSetTransform,
  },
  audio: {
    se: { play: vi.fn() },
  },
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import { useCharacterSettings } from "./useCharacterSettings";

const BASE_TRANSFORM = {
  scale: [1, 1, 1] as [number, number, number],
  translation: [2.5, -1.0, 0.3] as [number, number, number],
  rotation: [0, 0, 0, 1] as [number, number, number, number],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTransform.mockResolvedValue({ ...BASE_TRANSFORM });
  mockVrm.persona.mockResolvedValue({
    profile: "test profile",
    personality: "friendly",
    ocean: {},
    metadata: {},
  });
  mockWebview.linkedVrm.mockResolvedValue(mockVrm);
});

describe("useCharacterSettings — posX/posY", () => {
  it("initializes posX from transform.translation[0]", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posX).toBe(2.5);
  });

  it("initializes posY from transform.translation[1]", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posY).toBe(-1.0);
  });

  it("exposes setPosX and setPosY", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.setPosX).toBe("function");
    expect(typeof result.current.setPosY).toBe("function");
  });

  it("updates posX when setPosX is called", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPosX(5.0));
    expect(result.current.posX).toBe(5.0);
  });

  it("updates posY when setPosY is called", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPosY(3.5));
    expect(result.current.posY).toBe(3.5);
  });
});

describe("useCharacterSettings — handleSave preserves translation[2]", () => {
  it("passes posX, posY to setTransform and preserves translation[2]", async () => {
    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPosX(1.0));
    act(() => result.current.setPosY(2.0));

    mockGetTransform.mockResolvedValueOnce({
      ...BASE_TRANSFORM,
      translation: [0, 0, 0.3] as [number, number, number],
    });

    await act(() => result.current.handleSave());

    expect(mockSetTransform).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        translation: [1.0, 2.0, 0.3],
      })
    );
  });

  it("preserves translation[2] when posX/posY are default", async () => {
    const zValue = 0.3;
    mockGetTransform.mockResolvedValue({
      ...BASE_TRANSFORM,
      translation: [2.5, -1.0, zValue] as [number, number, number],
    });

    const { result } = renderHook(() => useCharacterSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.handleSave());

    const callArgs = mockSetTransform.mock.calls[0];
    expect(callArgs[1].translation[2]).toBe(zValue);
  });
});
