import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";

beforeEach(() => {
  useStore.setState({
    messages: [],
    sessions: [],
    activeSessionId: null,
    isTyping: false,
    connectionStatus: "disconnected",
    settings: { user_id: "", agent_id: "", fastapi_rest_url: "" },
  });
});

describe("store — messages", () => {
  it("appendStreamChunk adds to streaming message", () => {
    useStore.getState().startStreaming("turn-1", "sess-1");
    useStore.getState().appendStreamChunk("turn-1", "Hello");
    useStore.getState().appendStreamChunk("turn-1", " world");
    const msg = useStore.getState().messages[0];
    expect(msg.content).toBe("Hello world");
    expect(msg.streaming).toBe(true);
  });

  it("finalizeMessage replaces content and clears streaming flag", () => {
    useStore.getState().startStreaming("turn-1", "sess-1");
    useStore.getState().appendStreamChunk("turn-1", "partial");
    useStore.getState().finalizeMessage("turn-1", "full content");
    const msg = useStore.getState().messages[0];
    expect(msg.content).toBe("full content");
    expect(msg.streaming).toBe(false);
  });

  it("addUserMessage appends a user message", () => {
    useStore.getState().addUserMessage("hi");
    expect(useStore.getState().messages).toHaveLength(1);
    expect(useStore.getState().messages[0].role).toBe("user");
  });
});

describe("store — connectionStatus", () => {
  it("setConnectionStatus updates status", () => {
    useStore.getState().setConnectionStatus("connected");
    expect(useStore.getState().connectionStatus).toBe("connected");
  });
});

describe("store — settings", () => {
  it("setSettings updates settings", () => {
    useStore.getState().setSettings({
      user_id: "alice",
      agent_id: "yuri",
      fastapi_rest_url: "http://localhost:5500",
    });
    expect(useStore.getState().settings.user_id).toBe("alice");
  });
});

describe("store — isTyping", () => {
  it("startStreaming sets isTyping true", () => {
    useStore.getState().startStreaming("t1", "s1");
    expect(useStore.getState().isTyping).toBe(true);
  });

  it("finalizeMessage sets isTyping false", () => {
    useStore.getState().startStreaming("t1", "s1");
    useStore.getState().finalizeMessage("t1", "done");
    expect(useStore.getState().isTyping).toBe(false);
  });
});
