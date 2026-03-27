import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function ChatWindow() {
  const { messages, isTyping } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${
            msg.role === "user" ? "items-end" : "items-start"
          }`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm text-white ${
              msg.role === "user"
                ? "bg-blue-600/60"
                : "bg-white/10 backdrop-blur-sm"
            }`}
          >
            {msg.content}
            {msg.streaming && (
              <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-white/70 animate-pulse align-text-bottom" />
            )}
          </div>
          <div className="text-white/30 text-[10px] mt-0.5">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
      {isTyping && messages.findLast((m) => m.streaming) === undefined && (
        <div className="flex items-start">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm text-white/60">
            ...
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
