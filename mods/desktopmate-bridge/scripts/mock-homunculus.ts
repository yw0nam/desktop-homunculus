import * as http from "node:http";

const PORT = 3100;

const server = http.createServer((req, res) => {
  console.log(`[mock-homunculus] ${req.method} ${req.url}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-homunculus] listening on http://127.0.0.1:${PORT}`);
});
