import * as http from "node:http";

const PORT = parseInt(process.env.MOCK_PORT || "3100", 10);

// --- RPC response handlers ---

type RpcBody = Record<string, unknown>;

function handleRpcCall(method: string, body: RpcBody): unknown {
  switch (method) {
    case "getStatus":
      return {
        status: "connected",
        config: {
          user_id: "test_user",
          agent_id: "yuri",
          fastapi_rest_url: "http://localhost:5500",
          fastapi_ws_url: "ws://localhost:5500",
          fastapi_token: "test_token",
          homunculus_api_url: "http://localhost:3100",
          tts_reference_id: "",
        },
      };
    case "sendMessage":
      return { ok: true };
    case "interruptStream":
      return { ok: true };
    case "updateConfig":
      return { ok: true };
    case "reconnect":
      return { ok: true };
    case "listWindows":
      return [
        { id: "1", title: "Mock Window A" },
        { id: "2", title: "Mock Window B" },
      ];
    case "captureScreen":
      return { base64: "" };
    case "captureWindow":
      return { base64: "" };
    default:
      return { ok: true };
  }
}

// --- SSE signal payloads ---

function initialSignalPayload(signal: string): unknown {
  switch (signal) {
    case "dm-connection-status":
      return "connected";
    case "dm-config":
      return {
        user_id: "test_user",
        agent_id: "yuri",
        fastapi_rest_url: "http://localhost:5500",
        fastapi_ws_url: "ws://localhost:5500",
        fastapi_token: "test_token",
        homunculus_api_url: "http://localhost:3100",
        tts_reference_id: "",
      };
    case "dm-stream-token":
      return { token: "" };
    case "dm-tts-chunk":
      return { chunk: "" };
    case "dm-typing-start":
      return {};
    case "dm-message-complete":
      return { session_id: "mock-session-1" };
    default:
      return null;
  }
}

// --- Request routing ---

function routeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
): void {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  if (method === "POST" && url === "/rpc/call") {
    handleRpcRequest(res, body);
    return;
  }

  const signalMatch = url.match(/^\/signals\/(.+)$/);
  if (method === "GET" && signalMatch) {
    handleSignalRequest(res, signalMatch[1]);
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function handleRpcRequest(res: http.ServerResponse, rawBody: string): void {
  let parsed: { method?: string; body?: RpcBody } = {};
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    // ignore parse errors — fall through to default
  }

  const method = parsed.method ?? "";
  const body = parsed.body ?? {};
  const result = handleRpcCall(method, body);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}

function handleSignalRequest(res: http.ServerResponse, signal: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const payload = initialSignalPayload(signal);
  if (payload !== null) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // Keep connection open (client holds SSE stream open)
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15_000);

  res.on("close", () => clearInterval(keepAlive));
}

// --- Server bootstrap ---

const server = http.createServer((req, res) => {
  console.log(`[mock-homunculus] ${req.method} ${req.url}`);

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    routeRequest(req, res, body);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-homunculus] listening on http://127.0.0.1:${PORT}`);
});
