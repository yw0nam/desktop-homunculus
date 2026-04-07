# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.1] - 2026-04-07

### For contributors

- **desktopmate-bridge**: Reorganized test files to stay within the 400-line limit (GP-13). TC-LC-08 session-continuity tests moved to `tests/e2e/session-continuity.test.ts`; DH-BUG-13 reconnect tests moved to `ui/src/components/ControlBar.reconnect.test.tsx`.

## [0.0.2.0] - 2026-04-06

### Added

- **desktopmate-bridge**: Full E2E test suite covering WebSocket connection lifecycle (TC-LC-01~08), config file I/O (TC-CW-01~07), and Playwright browser UI tests (TC-UI-01~05). Run with `pnpm test:e2e` and `npx playwright test`.
- **desktopmate-bridge**: Shared WebSocket helpers (`openWs`, `collectMessages`, `authorizedWs`, `sendChatTurn`) extracted to `tests/e2e/helpers/ws.ts` — all E2E tests now import from one place.
- **desktopmate-bridge**: `VITE_TEST_MODE` mock SDK (`ui/test/mock-sdk/`) enables Playwright browser tests without a running backend.

### Changed

- **desktopmate-bridge**: `applyConfigToDisk` and `loadConfigFrom` extracted from `service.ts` into standalone `src/config-io.ts` — fully testable without the service import chain.
- **desktopmate-bridge**: Vite test-mode aliases converted from object form to array form with `@hmcs/sdk/rpc` first, fixing prefix-match resolution bug.
- **desktopmate-bridge**: `sessions.test.ts` refactored to import shared WS helpers from `helpers/ws.ts`.

## [0.1.0-alpha.10] - 2026-04-05

### Fixed

- **desktopmate-bridge**: `pickRandom()` no longer throws on empty phrase arrays — returns `null` and callers skip the reaction silently, so a misconfigured `ReactionConfig` with empty arrays no longer crashes the controller.
- **desktopmate-bridge**: `ReactionController.stop()` now resets `lastWindowTitle` to `null` — prevents stale window state from suppressing the first window-change reaction after the controller is restarted.
- **desktopmate-bridge**: Test global `fetch` leak fixed — `global.fetch = mockFetch` at module scope replaced with `vi.stubGlobal` / `vi.unstubAllGlobals` per-test lifecycle to prevent cross-test state pollution.
- **character-settings**: `PositionRow` number input now uses a local string state so users can type negative values (e.g. `-3`) without the field resetting on intermediate input like `-`.
- **character-settings**: `vitest.config.ts` now defines `__dirname` via `fileURLToPath(import.meta.url)` for ESM compatibility — fixes test runner startup failure in ESM environments.

## [0.1.0-alpha.9] - 2026-04-04

### Added

- **desktopmate-bridge**: `ReactionController` — mascot now reacts to primary click (speaks a random click phrase), idle timeout (speaks after 5 minutes of inactivity), and active window focus change (speaks a window-context phrase with the app title). All reactions are skipped while chat TTS is playing.
- **desktopmate-bridge**: `TtsChunkQueue.isBusy()` — synchronous check for whether a TTS chunk is currently being processed or buffered.
- **desktopmate-bridge**: `reactions` config section in `config.yaml` — configurable phrases for click, idle, and window events plus `idle_timeout_ms` / `window_check_interval_ms` intervals.
- **desktopmate-bridge**: `active-win` npm dependency for active window title polling.

### Fixed

- **desktopmate-bridge**: Fixed `activeCount` double-decrement in `TtsChunkQueue.scheduleProcessor` on generation mismatch — use `Promise.finally()` to guarantee single decrement regardless of code path.
- **desktopmate-bridge**: Prevent interval leak when `ReactionController.start()` is called multiple times — `startWindowWatcher()` now clears any existing interval before creating a new one.

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
