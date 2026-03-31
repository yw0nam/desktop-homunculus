// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { act } from "react";

afterEach(() => cleanup());

const mockListWindows = vi.fn();
const mockCaptureScreen = vi.fn();
const mockCaptureWindow = vi.fn();

vi.mock("../api", () => ({
  listWindows: (...args: unknown[]) => mockListWindows(...args),
  captureScreen: (...args: unknown[]) => mockCaptureScreen(...args),
  captureWindow: (...args: unknown[]) => mockCaptureWindow(...args),
}));

vi.mock("@hmcs/sdk", () => ({
  signals: { send: vi.fn().mockResolvedValue(undefined) },
}));

const mockSetCaptureMode = vi.fn();
const mockSetCaptureWindowList = vi.fn();
const mockSetCaptureSelectedWindowId = vi.fn();
const mockSetCapturePreview = vi.fn();

const baseStoreState = {
  captureMode: "fullscreen" as const,
  captureWindowList: [] as { id: string; title: string }[],
  captureSelectedWindowId: null as string | null,
  capturePreview: null as string | null,
  setCaptureMode: mockSetCaptureMode,
  setCaptureWindowList: mockSetCaptureWindowList,
  setCaptureSelectedWindowId: mockSetCaptureSelectedWindowId,
  setCapturePreview: mockSetCapturePreview,
};

let storeState = { ...baseStoreState };

vi.mock("../store", () => ({
  useStore: vi.fn(() => storeState),
}));

beforeEach(() => {
  storeState = { ...baseStoreState };
  vi.clearAllMocks();
  mockListWindows.mockResolvedValue([]);
  mockCaptureScreen.mockResolvedValue({ base64: "screen-base64" });
  mockCaptureWindow.mockResolvedValue({ base64: "window-base64" });
});

import { CapturePanel } from "./CapturePanel";

describe("CapturePanel — mode buttons", () => {
  it("renders Fullscreen and Window mode buttons", () => {
    const { getByText } = render(<CapturePanel />);
    expect(getByText(/Fullscreen/)).toBeTruthy();
    expect(getByText(/Window/)).toBeTruthy();
  });

  it("fullscreen button is active when mode is fullscreen", () => {
    const { getByTitle } = render(<CapturePanel />);
    const btn = getByTitle("Fullscreen mode");
    expect(btn.className).toContain("btn-mode-active");
  });

  it("window button is active when mode is window", () => {
    storeState = { ...baseStoreState, captureMode: "window" };
    const { getByTitle } = render(<CapturePanel />);
    const btn = getByTitle("Window mode");
    expect(btn.className).toContain("btn-mode-active");
  });
});

describe("CapturePanel — mode switching", () => {
  it("clicking Window button calls setCaptureMode with 'window'", async () => {
    mockListWindows.mockResolvedValue([]);
    const { getByTitle } = render(<CapturePanel />);
    await act(async () => {
      fireEvent.click(getByTitle("Window mode"));
    });
    expect(mockSetCaptureMode).toHaveBeenCalledWith("window");
  });

  it("clicking Fullscreen button calls setCaptureMode with 'fullscreen'", async () => {
    storeState = { ...baseStoreState, captureMode: "window" };
    const { getByTitle } = render(<CapturePanel />);
    await act(async () => {
      fireEvent.click(getByTitle("Fullscreen mode"));
    });
    expect(mockSetCaptureMode).toHaveBeenCalledWith("fullscreen");
  });

  it("switching to window mode calls listWindows()", async () => {
    mockListWindows.mockResolvedValue([{ id: "1", title: "Test Window" }]);
    const { getByTitle } = render(<CapturePanel />);
    await act(async () => {
      fireEvent.click(getByTitle("Window mode"));
    });
    expect(mockListWindows).toHaveBeenCalledOnce();
  });

  it("window selector hidden when mode is fullscreen", () => {
    const { queryByTestId } = render(<CapturePanel />);
    expect(queryByTestId("window-selector")).toBeNull();
  });

  it("window selector visible when mode is window", () => {
    storeState = {
      ...baseStoreState,
      captureMode: "window",
      captureWindowList: [{ id: "w1", title: "Test" }],
    };
    const { getByTestId } = render(<CapturePanel />);
    expect(getByTestId("window-selector")).toBeTruthy();
  });
});

describe("CapturePanel — window list and selection", () => {
  beforeEach(() => {
    storeState = {
      ...baseStoreState,
      captureMode: "window",
      captureWindowList: [
        { id: "w1", title: "Code Editor" },
        { id: "w2", title: "Chrome — YouTube" },
      ],
    };
  });

  it("renders all windows from captureWindowList in the dropdown trigger", () => {
    const { getByTestId } = render(<CapturePanel />);
    expect(getByTestId("window-selector")).toBeTruthy();
  });

  it("clicking a window calls setCaptureSelectedWindowId", async () => {
    storeState = {
      ...baseStoreState,
      captureMode: "window",
      captureWindowList: [
        { id: "w1", title: "Code Editor" },
        { id: "w2", title: "Chrome — YouTube" },
      ],
    };
    const { getByTestId, getByText } = render(<CapturePanel />);
    // open dropdown
    await act(async () => {
      fireEvent.click(getByTestId("window-dropdown-trigger"));
    });
    // click window
    await act(async () => {
      fireEvent.click(getByText("Chrome — YouTube"));
    });
    expect(mockSetCaptureSelectedWindowId).toHaveBeenCalledWith("w2");
  });

  it("selecting a window calls captureWindow(id)", async () => {
    storeState = {
      ...baseStoreState,
      captureMode: "window",
      captureWindowList: [{ id: "w1", title: "Code Editor" }],
    };
    const { getByTestId, getByText } = render(<CapturePanel />);
    await act(async () => {
      fireEvent.click(getByTestId("window-dropdown-trigger"));
    });
    await act(async () => {
      fireEvent.click(getByText("Code Editor"));
    });
    await waitFor(() => expect(mockCaptureWindow).toHaveBeenCalledWith("w1"));
  });
});

describe("CapturePanel — preview", () => {
  it("does not render preview img when capturePreview is null", () => {
    const { queryByRole } = render(<CapturePanel />);
    expect(queryByRole("img")).toBeNull();
  });

  it("renders preview img when capturePreview is set", () => {
    storeState = { ...baseStoreState, capturePreview: "abc123" };
    const { getByRole } = render(<CapturePanel />);
    const img = getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,abc123");
  });
});
