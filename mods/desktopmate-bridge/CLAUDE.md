# desktopmate-bridge CLAUDE.md

## Build & Test

```bash
# from mods/desktopmate-bridge/
npx vitest run        # unit tests
pnpm build:ui         # Vite build → ui/dist/index.html (gitignored)
cd ui && npx tsc --noEmit  # type-check (pre-existing errors in ChatWindow.tsx / useSignals.ts — findLast requires ES2023 lib, do not fix)
```

## Visual Development (agent-browser) — MANDATORY for FE tasks

**UI 변경을 포함하는 모든 FE 태스크는 아래 3단계를 반드시 완료해야 한다. 단위 테스트 통과만으로는 태스크 완료가 아니다.**

### Step 1 — Unit Tests
```bash
npx vitest run   # from mods/desktopmate-bridge/
```

### Step 2 — Visual Verification
`/agent-browser` 스킬로 실제 렌더링 확인:

```bash
# Start Vite dev server (from mods/desktopmate-bridge/ui/)
pnpm dev
# Dev server runs at http://localhost:5173

# In agent-browser:
# $B goto http://localhost:5173
# $B screenshot /tmp/preview.png
# $B snapshot -i -a -o /tmp/annotated.png
```

For static HTML mockups (design-agent output), open directly:
```bash
# $B goto file:///path/to/design/{feature}/mockup.html
# $B screenshot /tmp/mockup-preview.png
```

Always use Read tool on the output PNG to display the screenshot in the conversation.

### Step 3 — Backend E2E Integration
실제 FastAPI 백엔드 대상 Vitest E2E 테스트:
```bash
# from mods/desktopmate-bridge/
FASTAPI_URL=http://localhost:5500 pnpm test:e2e   # TC-LC, TC-CW (33 tests + 1 skipped)

# Playwright UI E2E (mock-sdk 사용, 백엔드 불필요):
cd ui && npx playwright test   # TC-UI-01~05 (5 tests)
```

## Directory Structure

```
desktopmate-bridge/
├── src/                    # Service source files
│   ├── service.ts          # Entry point (homunculus.service)
│   ├── config-io.ts        # YAML config read/write: applyConfigToDisk + loadConfigFrom
│   ├── screen-capture.ts   # Screen/window capture via node-screenshots
│   └── tts-chunk-queue.ts  # TTS chunk ordering & buffering
├── commands/
│   └── open-chat.ts        # "Chat" menu command (opens/closes chat UI)
├── scripts/
│   └── mock-homunculus.ts  # Mock HTTP backend for local E2E testing (port 3100)
├── tests/
│   ├── unit/               # Unit tests (no external deps)
│   └── e2e/                # E2E tests (require real FastAPI backend)
│       ├── helpers/ws.ts   # Shared WS helpers (openWs, collectMessages, authorizedWs, sendChatTurn)
│       ├── connection-lifecycle.test.ts  # TC-LC-01~07
│       ├── session-continuity.test.ts    # TC-LC-08 (session continuity after reconnect)
│       ├── config-write.test.ts          # TC-CW-01~07
│       └── ui-browser.spec.ts            # TC-UI-01~05 (Playwright)
├── ui/                     # React chat UI (Vite app)
│   └── test/mock-sdk/      # VITE_TEST_MODE mocks for Playwright tests
├── config.yaml             # Runtime config (fastapi, homunculus, tts, reactions)
├── vitest.config.ts        # Unit test config (includes tests/unit/, ui/src/)
└── vitest.e2e.config.ts    # E2E test config (includes tests/e2e/)
```

## Architecture

Config flow: `config.yaml` → `loadConfigFrom(CONFIG_PATH)` → `broadcastConfig()` → `dm-config` signal → UI store `settings`.
Write-back: `applyConfigToDisk(config, input, CONFIG_PATH)` in `src/config-io.ts` (called from service.ts RPC handler).

`ConnectionStatus` type is defined in `ui/src/types.ts` (not the store).

## React Gotchas

**Window event listeners must use `useCallback`** — plain function declarations inside a component body are recreated on every render; `removeEventListener` uses reference equality and silently fails if the component re-renders between attach and detach. Always stabilize with `useCallback(fn, [])` (or stable deps).

**Exhaustive lookup maps** — use `satisfies Record<UnionType, string>` for label maps (e.g. `STATUS_LABELS`) so TypeScript errors on unhandled union members.
