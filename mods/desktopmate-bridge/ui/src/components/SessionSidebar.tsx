import { useState } from "react";
import { useStore } from "../store";
import {
  fetchChatHistory,
  fetchSessions,
  deleteSession,
  patchSessionName,
} from "../api";

export function SessionSidebar() {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    setMessages,
    setSessions,
    settings,
  } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleSelectSession(sessionId: string) {
    setActiveSession(sessionId);
    const history = await fetchChatHistory(
      settings.fastapi_rest_url,
      sessionId,
      settings.user_id,
      settings.agent_id,
    ).catch(() => []);
    setMessages(history);
  }

  function handleNewChat() {
    setActiveSession(null);
  }

  async function handleDelete(sessionId: string) {
    if (!confirm("Delete this session?")) return;
    try {
      await deleteSession(
        settings.fastapi_rest_url,
        sessionId,
        settings.user_id,
        settings.agent_id,
      );
      const updated = await fetchSessions(
        settings.fastapi_rest_url,
        settings.user_id,
        settings.agent_id,
      );
      setSessions(updated);
    } catch {
      alert("Failed to delete session.");
    }
  }

  async function handleRenameCommit(sessionId: string) {
    try {
      await patchSessionName(settings.fastapi_rest_url, sessionId, editName);
    } catch {
      // silently revert
    }
    setEditingId(null);
    const updated = await fetchSessions(
      settings.fastapi_rest_url,
      settings.user_id,
      settings.agent_id,
    ).catch(() => sessions);
    setSessions(updated);
  }

  return (
    <div className="w-48 flex flex-col bg-black/30 backdrop-blur-sm border-r border-white/10 overflow-y-auto">
      <div className="text-white/80 text-xs font-semibold px-2 pt-2 pb-1">
        Conversations
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.session_id}
            className={`px-2 py-1 cursor-pointer hover:bg-white/10 ${
              s.session_id === activeSessionId ? "bg-white/20" : ""
            }`}
            onClick={() => handleSelectSession(s.session_id)}
          >
            {editingId === s.session_id ? (
              <input
                className="bg-white/20 text-white text-xs w-full outline-none rounded px-1"
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRenameCommit(s.session_id)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleRenameCommit(s.session_id)
                }
              />
            ) : (
              <>
                <div className="text-white text-xs truncate">{s.name}</div>
                <div className="flex gap-1 mt-0.5 items-center">
                  <button
                    className="text-white/40 text-[10px] hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(s.session_id);
                      setEditName(s.name);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="text-white/40 text-[10px] hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.session_id);
                    }}
                  >
                    🗑
                  </button>
                  <div className="ml-auto text-right">
                    <div className="text-white/20 text-[10px]">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </div>
                    <div className="text-white/15 text-[9px]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <button
        className="text-white/60 text-xs py-2 hover:text-white hover:bg-white/10 border-t border-white/10"
        onClick={handleNewChat}
      >
        + New Chat
      </button>
    </div>
  );
}
