import type { Session, Message } from "./types";

async function apiFetch(
  restUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${restUrl}${path}`, init);
}

interface BackendSession {
  session_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export async function fetchSessions(
  restUrl: string,
  userId: string,
  agentId: string,
): Promise<Session[]> {
  const res = await apiFetch(
    restUrl,
    `/v1/stm/sessions?user_id=${userId}&agent_id=${agentId}`,
  );
  if (!res.ok) throw new Error(`fetchSessions failed: ${res.status}`);
  const data = await res.json() as { sessions: BackendSession[] };
  return data.sessions.map((s) => ({
    session_id: s.session_id,
    name: (s.metadata?.name as string | undefined) ?? s.session_id.slice(0, 12),
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));
}

interface BackendMessage {
  role: "user" | "assistant";
  content: string;
}

export async function fetchChatHistory(
  restUrl: string,
  sessionId: string,
  userId: string,
  agentId: string,
): Promise<Message[]> {
  const res = await apiFetch(
    restUrl,
    `/v1/stm/get-chat-history?session_id=${sessionId}&user_id=${userId}&agent_id=${agentId}`,
  );
  if (!res.ok) throw new Error(`fetchChatHistory failed: ${res.status}`);
  const data = await res.json() as { messages: BackendMessage[] };
  return data.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      timestamp: Date.now(),
    }));
}

export async function deleteSession(
  restUrl: string,
  sessionId: string,
  userId: string,
  agentId: string,
): Promise<void> {
  const res = await apiFetch(
    restUrl,
    `/v1/stm/sessions/${sessionId}?user_id=${userId}&agent_id=${agentId}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`deleteSession failed: ${res.status}`);
}

export async function patchSessionName(
  restUrl: string,
  sessionId: string,
  name: string,
): Promise<void> {
  const res = await apiFetch(
    restUrl,
    `/v1/stm/sessions/${sessionId}/metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) throw new Error(`patchSessionName failed: ${res.status}`);
}

import { rpc } from "@hmcs/sdk/rpc";

export async function sendChatMessage(
  sessionId: string | undefined,
  content: string,
): Promise<void> {
  await rpc.call({
    modName: "@hmcs/desktopmate-bridge",
    method: "sendMessage",
    body: { content, session_id: sessionId },
  });
}

export async function interruptStream(): Promise<void> {
  await rpc.call({
    modName: "@hmcs/desktopmate-bridge",
    method: "interruptStream",
  });
}
