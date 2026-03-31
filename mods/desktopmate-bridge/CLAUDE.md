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
```

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
mock-homunculus로 실제 WS 통신 검증:
```bash
# from mods/desktopmate-bridge/
npx tsx scripts/mock-homunculus.ts   # mock backend 기동
npx vitest run --config vitest.e2e.config.ts   # E2E 테스트
```

## Architecture

Config flow: `config.yaml` → `loadConfig()` → `broadcastConfig()` → `dm-config` signal → UI store `settings`.
Write-back: `writeFileSync(CONFIG_PATH, yaml.dump(config))` in `service.ts`.

`ConnectionStatus` type is defined in `ui/src/types.ts` (not the store).

## React Gotchas

**Window event listeners must use `useCallback`** — plain function declarations inside a component body are recreated on every render; `removeEventListener` uses reference equality and silently fails if the component re-renders between attach and detach. Always stabilize with `useCallback(fn, [])` (or stable deps).

**Exhaustive lookup maps** — use `satisfies Record<UnionType, string>` for label maps (e.g. `STATUS_LABELS`) so TypeScript errors on unhandled union members.
