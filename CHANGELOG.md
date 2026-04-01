# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-alpha.6] - 2026-04-01

### Fixed

- **desktopmate-bridge**: `fastapi_token` is now optional in both `DmConfig` type and `updateConfig` Zod schema — saving settings without touching the token field no longer fails validation
- **desktopmate-bridge**: TTS chunks now play in the correct order via a serialized promise chain in `TtsChunkQueue`; added `drain()` public method to await pending processing
- **desktopmate-bridge**: WebSocket message handler now catches `JSON.parse` errors and emits a `dm-connection-status` error signal instead of crashing silently
- **desktopmate-bridge**: WebSocket reconnect no longer leaks stale close handlers across reconnect cycles
- **desktopmate-bridge**: STM API calls (`fetchSessions`, `fetchChatHistory`, `deleteSession`, `patchSessionName`) now use `URLSearchParams` / `encodeURIComponent` — session IDs with special characters are encoded correctly
- **desktopmate-bridge**: `captureScreen` now throws a clear error when `Monitor.all()` returns an empty list instead of indexing into an empty array
- **desktopmate-bridge**: `open-chat` command reuses a single `Webview` instance to prevent TOCTOU race between `isClosed()` and `close()`
