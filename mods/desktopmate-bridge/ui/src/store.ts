import { create } from "zustand";
import type { Message, Session, DmConfig, ConnectionStatus } from "./types";

interface StoreState {
  messages: Message[];
  sessions: Session[];
  activeSessionId: string | null;
  isTyping: boolean;
  connectionStatus: ConnectionStatus;
  settings: DmConfig;
  captureMode: "fullscreen" | "window";
  captureWindowList: { id: string; title: string }[];
  captureSelectedWindowId: string | null;
  capturePreview: string | null;

  addUserMessage: (content: string) => void;
  startStreaming: (turnId: string, sessionId: string) => void;
  appendStreamChunk: (turnId: string, text: string) => void;
  finalizeMessage: (turnId: string, content: string) => void;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSettings: (settings: DmConfig) => void;
  setCaptureMode: (mode: "fullscreen" | "window") => void;
  setCaptureWindowList: (windows: { id: string; title: string }[]) => void;
  setCaptureSelectedWindowId: (id: string | null) => void;
  setCapturePreview: (base64: string | null) => void;
  resetStreaming: () => void;
}

export const useStore = create<StoreState>((set) => ({
  messages: [],
  sessions: [],
  activeSessionId: null,
  isTyping: false,
  connectionStatus: "disconnected",
  settings: {
    user_id: "",
    agent_id: "",
    fastapi_rest_url: "",
    fastapi_ws_url: "",
    fastapi_token: "",
    homunculus_api_url: "",
    tts_reference_id: "",
  },
  captureMode: "fullscreen",
  captureWindowList: [],
  captureSelectedWindowId: null,
  capturePreview: null,

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  startStreaming: (turnId, sessionId) =>
    set((s) => ({
      activeSessionId: sessionId,
      isTyping: true,
      messages: [
        ...s.messages,
        {
          id: turnId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          streaming: true,
        },
      ],
    })),

  appendStreamChunk: (turnId, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === turnId ? { ...m, content: m.content + text } : m,
      ),
    })),

  finalizeMessage: (turnId, content) =>
    set((s) => ({
      isTyping: false,
      messages: s.messages.map((m) =>
        m.id === turnId ? { ...m, content, streaming: false } : m,
      ),
    })),

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (sessionId) =>
    set({ activeSessionId: sessionId, messages: [] }),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSettings: (settings) => set({ settings }),
  setCaptureMode: (captureMode) => set({ captureMode }),
  setCaptureWindowList: (captureWindowList) => set({ captureWindowList }),
  setCaptureSelectedWindowId: (captureSelectedWindowId) => set({ captureSelectedWindowId }),
  setCapturePreview: (capturePreview) => set({ capturePreview }),
  resetStreaming: () =>
    set((s) => {
      if (!s.isTyping && !s.messages.some((m) => m.streaming)) return s;
      return {
        isTyping: false,
        messages: s.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m,
        ),
      };
    }),
}));
