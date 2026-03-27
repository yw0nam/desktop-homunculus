# desktopmate-bridge CLAUDE.md

## Build & Test

```bash
# from mods/desktopmate-bridge/
npx vitest run        # unit tests
pnpm build:ui         # Vite build → ui/dist/index.html (gitignored)
cd ui && npx tsc --noEmit  # type-check (pre-existing errors in ChatWindow.tsx / useSignals.ts — findLast requires ES2023 lib, do not fix)
```

## Architecture

Config flow: `config.yaml` → `loadConfig()` → `broadcastConfig()` → `dm-config` signal → UI store `settings`.
Write-back: `writeFileSync(CONFIG_PATH, yaml.dump(config))` in `service.ts`.

`ConnectionStatus` type is defined in `ui/src/types.ts` (not the store).

## React Gotchas

**Window event listeners must use `useCallback`** — plain function declarations inside a component body are recreated on every render; `removeEventListener` uses reference equality and silently fails if the component re-renders between attach and detach. Always stabilize with `useCallback(fn, [])` (or stable deps).

**Exhaustive lookup maps** — use `satisfies Record<UnionType, string>` for label maps (e.g. `STATUS_LABELS`) so TypeScript errors on unhandled union members.
