# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-alpha.8] - 2026-04-03

### Fixed

- **desktopmate-bridge**: Remove `console.warn` calls from `tts-chunk-queue.ts` to comply with GP-13 (no console logging in production code)

### Changed

- **desktopmate-bridge**: Refactor `ControlBar.test.tsx` — extract `mockStore()` helper to eliminate repeated `useStore` mock boilerplate (445 → 375 lines, GP-13-size compliant)

## [0.1.0-alpha.7] - 2026-04-01

### Fixed

- **desktopmate-bridge**: TTS audio no longer overlaps — `waitForCompletion` is now `true` so each chunk finishes before the next begins ([a624ed0])
- **desktopmate-bridge**: Streaming text from the backend is now displayed in real time — `stream_token` events are mapped to the `dm-stream-token` signal and rendered incrementally in the UI ([a624ed0])
- **desktopmate-bridge**: Screen capture images are correctly typed as `ImageContent` objects — the RPC schema, `api.ts` types, and handler are now consistent ([a624ed0])
- **desktopmate-bridge**: Webview drag now uses the actual CSS `scale` transform value instead of a hardcoded constant, and RAF throttle (latest-event pattern) prevents queued-up move events from feeling laggy ([a624ed0])
- **desktopmate-bridge**: A Reconnect button is now available in the control bar — one click triggers the `reconnect` RPC, which cleanly closes the existing WebSocket before opening a fresh one ([f628053])

## [0.1.0-alpha.6] - 2026-04-01

### Fixed

- **desktopmate-bridge**: `fastapi_token` is now optional in both `DmConfig` type and `updateConfig` Zod schema — saving settings without touching the token field no longer fails validation
- **desktopmate-bridge**: TTS chunks now always play in the correct order — no more out-of-order audio when messages arrive quickly
- **desktopmate-bridge**: Malformed WebSocket frames no longer crash the bridge silently — the connection status UI now shows an error
- **desktopmate-bridge**: WebSocket reconnection is more reliable and no longer leaves stale event listeners from the previous connection
- **desktopmate-bridge**: Session IDs containing special characters (spaces, slashes, etc.) are now encoded correctly in all STM API calls
- **desktopmate-bridge**: `captureScreen` now surfaces a clear error when no monitors are found, instead of crashing with an obscure index error
- **desktopmate-bridge**: Opening the chat window no longer flickers or spawns multiple instances when triggered in quick succession
