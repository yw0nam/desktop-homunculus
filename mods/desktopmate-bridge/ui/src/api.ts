import type { Session, Message } from "./types";

async function apiFetch(
  restUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${restUrl}${path}`, init);
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
  return res.json();
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
  return res.json();
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
    modName: "desktopmate-bridge",
    method: "sendMessage",
    body: { content, session_id: sessionId },
  });
}

export async function interruptStream(): Promise<void> {
  await rpc.call({
    modName: "desktopmate-bridge",
    method: "interruptStream",
  });
}
