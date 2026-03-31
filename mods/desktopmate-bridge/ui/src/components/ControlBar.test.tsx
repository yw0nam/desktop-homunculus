// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("@hmcs/sdk", () => {
  const mockWebview = {
    info: vi.fn().mockResolvedValue({ offset: [0, 0] }),
    setOffset: vi.fn().mockResolvedValue(undefined),
  };
  return {
    Webview: {
      current: vi.fn().mockReturnValue(mockWebview),
    },
  };
});

vi.mock("../store", () => ({
  useStore: vi.fn().mockReturnValue({
    isTyping: false,
    connectionStatus: "disconnected",
    activeSessionId: null,
    addUserMessage: vi.fn(),
  }),
}));

vi.mock("../api", () => ({
  sendChatMessage: vi.fn(),
  interruptStream: vi.fn(),
}));

import { ControlBar } from "./ControlBar";

const noop = () => {};

function renderControlBar() {
  return render(
    <ControlBar
      onToggleChat={noop}
      onToggleSidebar={noop}
      onToggleSettings={noop}
    />
  );
}

describe("ControlBar — drag handle element", () => {
  it("renders drag handle as div[role=button], not <button>", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");
    expect(handle.tagName.toLowerCase()).toBe("div");
    expect(handle.getAttribute("role")).toBe("button");
  });

  it("drag handle has tabIndex=0", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");
    expect(handle.tabIndex).toBe(0);
  });

  it("handleDragStart calls preventDefault and stopPropagation", () => {
    const { getByTitle } = renderControlBar();
    const handle = getByTitle("Drag");

    const preventDefaultSpy = vi.spyOn(Event.prototype, "preventDefault");
    const stopPropagationSpy = vi.spyOn(Event.prototype, "stopPropagation");

    fireEvent.mouseDown(handle);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
    stopPropagationSpy.mockRestore();
  });
});
