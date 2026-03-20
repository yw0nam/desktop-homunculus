import { create } from "zustand";
import type { Message, Session, DmConfig, ConnectionStatus } from "./types";

interface StoreState {
  messages: Message[];
  sessions: Session[];
  activeSessionId: string | null;
  isTyping: boolean;
  connectionStatus: ConnectionStatus;
  settings: DmConfig;

  addUserMessage: (content: string) => void;
  startStreaming: (turnId: string, sessionId: string) => void;
  appendStreamChunk: (turnId: string, text: string) => void;
  finalizeMessage: (turnId: string, content: string) => void;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  clearMessages: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSettings: (settings: DmConfig) => void;
}

export const useStore = create<StoreState>((set) => ({
  messages: [],
  sessions: [],
  activeSessionId: null,
  isTyping: false,
  connectionStatus: "disconnected",
  settings: { user_id: "", agent_id: "", fastapi_rest_url: "" },

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

  startStreaming: (turnId, _sessionId) =>
    set((s) => ({
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
  clearMessages: () => set({ messages: [] }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSettings: (settings) => set({ settings }),
}));
