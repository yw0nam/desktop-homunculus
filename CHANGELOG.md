# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-alpha.6] - 2026-04-01

### Fixed

- **desktopmate-bridge**: `fastapi_token` is now optional in both `DmConfig` type and `updateConfig` Zod schema — saving settings without touching the token field no longer fails validation
- **desktopmate-bridge**: TTS chunks now always play in the correct order — no more out-of-order audio when messages arrive quickly
- **desktopmate-bridge**: Malformed WebSocket frames no longer crash the bridge silently — the connection status UI now shows an error
- **desktopmate-bridge**: WebSocket reconnection is more reliable and no longer leaves stale event listeners from the previous connection
- **desktopmate-bridge**: Session IDs containing special characters (spaces, slashes, etc.) are now encoded correctly in all STM API calls
- **desktopmate-bridge**: `captureScreen` now surfaces a clear error when no monitors are found, instead of crashing with an obscure index error
- **desktopmate-bridge**: Opening the chat window no longer flickers or spawns multiple instances when triggered in quick succession
