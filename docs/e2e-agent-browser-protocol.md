# Agent Browser UI Verification Protocol

> **Scope**: desktopmate-bridge UI (`mods/desktopmate-bridge/ui/`)
> This protocol is separate from `scripts/e2e.sh` (shell-automatable phases).
> Use the `/agent-browser` gstack skill to execute these steps interactively.

---

## Prerequisites

Both servers must be running before starting visual verification.

```bash
# Terminal 1 — mock backend
cd mods/desktopmate-bridge
npx tsx scripts/mock-homunculus.ts

# Terminal 2 — Vite dev server
cd mods/desktopmate-bridge/ui
pnpm dev
# → http://localhost:5173
```

Inject the WebView stub in browser console (or via test setup) if ControlBar drag
is needed during testing:

```javascript
window.WEBVIEW_ENTITY = 1;
```

---

## Step 1 — Page Load

```
$B goto http://localhost:5173
$B screenshot /tmp/step1-load.png
```

**Pass criteria**:
- No blank white page
- No red error boundary
- Chat window or loading state is visible

---

## Step 2 — SettingsPanel Rendering

Navigate to or open the Settings panel (gear icon or Settings tab).

```
$B click [data-testid="settings-tab"]   # or equivalent selector
$B screenshot /tmp/step2-settings.png
```

**Pass criteria**:
- SettingsPanel renders without crash
- Input fields for `user_id`, `agent_id`, `fastapi_rest_url` are visible
- No console errors in browser devtools

---

## Step 3 — Connection Status Signal

The mock-homunculus sends `dm-connection-status: "connected"` on SSE connect.
After page load, the status indicator should reflect "connected".

```
$B screenshot /tmp/step3-status.png
```

**Pass criteria**:
- Connection status badge/icon shows "connected" (not "disconnected")

---

## Step 4 — Send Button → Backend RPC → Output Rendering

Type a message and submit.

```
$B fill [placeholder="Type a message..."] "Hello mock"
$B click button[type="submit"]
$B screenshot /tmp/step4-sent.png
```

The UI calls `rpc.call({ method: "sendMessage", ... })` which hits
`POST http://localhost:3100/rpc/call`. The mock returns `{ ok: true }`.

**Pass criteria**:
- User message appears in chat window
- No error toast or error boundary
- Send button returns to enabled state

---

## Step 5 — Window Selector (CapturePanel)

```
$B click [data-testid="window-selector"]
$B screenshot /tmp/step5-capture.png
```

**Pass criteria**:
- Dropdown opens (data-testid="window-dropdown-trigger" visible)
- Mock window list ("Mock Window A", "Mock Window B") appears

---

## Failure Reporting

For each failed step, attach:
1. Screenshot path
2. Browser console output (`$B console-errors`)
3. Mock server log (`/tmp/mock-homunculus.log`)

---

## Relationship to e2e.sh

| Phase | Tool | What it checks |
|-------|------|----------------|
| `scripts/e2e.sh` | bash + curl | Server startup, HTTP 200, no console.error in Vite log |
| This protocol | `/agent-browser` | Visual rendering, component interaction, RPC flow |

Both must pass before marking a FE task as complete.
