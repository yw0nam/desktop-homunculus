import { useEffect } from "react";
import { signals } from "@hmcs/sdk";
import { useStore } from "../store";
import { fetchSessions, getStatus } from "../api";
import type { DmConfig, ConnectionStatus } from "../types";

function subscribe<T>(
  signal: string,
  handler: (payload: T) => void | Promise<void>,
): () => void {
  const es = signals.stream<T>(signal, handler);
  return () => es.close();
}

export function useSignals(): void {
  const { setSettings, setConnectionStatus, startStreaming, appendStreamChunk, finalizeMessage, setSessions, settings } =
    useStore();

  useEffect(() => {
    getStatus()
      .then(({ status, config }) => {
        setConnectionStatus(status);
        setSettings(config);
        if (config.fastapi_rest_url) {
          fetchSessions(config.fastapi_rest_url, config.user_id, config.agent_id)
            .then(setSessions)
            .catch(() => {});
        }
      })
      .catch(() => {});

    const cleanups = [
      subscribe<DmConfig>("dm-config", async (cfg) => {
        setSettings(cfg);
        const sessions = await fetchSessions(cfg.fastapi_rest_url, cfg.user_id, cfg.agent_id).catch(() => []);
        setSessions(sessions);
      }),

      subscribe<{ status: ConnectionStatus }>(
        "dm-connection-status",
        ({ status }) => setConnectionStatus(status),
      ),

      subscribe<{ turn_id: string; session_id: string }>(
        "dm-typing-start",
        ({ turn_id, session_id }) => startStreaming(turn_id, session_id),
      ),

      subscribe<{ turn_id: string; chunk: string }>(
        "dm-stream-token",
        ({ turn_id, chunk }) => appendStreamChunk(turn_id, chunk),
      ),

      subscribe<{ sequence: number; text: string; emotion: string }>(
        "dm-tts-chunk",
        ({ text }) => {
          const { messages } = useStore.getState();
          const streaming = messages.findLast((m) => m.streaming);
          if (streaming) appendStreamChunk(streaming.id, text);
        },
      ),

      subscribe<{ turn_id: string; session_id: string; content: string }>(
        "dm-message-complete",
        async ({ turn_id, content }) => {
          finalizeMessage(turn_id, content);
          const { settings: s } = useStore.getState();
          if (s.fastapi_rest_url) {
            const updated = await fetchSessions(
              s.fastapi_rest_url,
              s.user_id,
              s.agent_id,
            ).catch(() => null);
            if (updated) setSessions(updated);
          }
        },
      ),
    ];

    return () => cleanups.forEach((fn) => fn());
  // Empty deps is intentional: handlers close over store actions (stable refs) and
  // read fresh state via useStore.getState() — re-subscribing on every render would
  // cause duplicate SSE connections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
