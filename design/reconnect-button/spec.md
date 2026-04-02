# Reconnect Button — Component Spec

Target file: `mods/desktopmate-bridge/ui/src/components/ControlBar.tsx`

---

## 1. Conditional Rendering

The Reconnect button is rendered **only** when `connectionStatus` is `"disconnected"` or `"restart-required"`.

```tsx
const showReconnect =
  connectionStatus === "disconnected" || connectionStatus === "restart-required";
```

Placement: inline with the status label, inside the existing status row `<div>`.

Before (current):
```tsx
<div className="text-xs text-white/60 text-center">{statusLabel}</div>
```

After:
```tsx
<div className="flex items-center justify-center gap-2">
  <div className="text-xs text-white/60">{statusLabel}</div>
  {showReconnect && (
    <ReconnectButton isReconnecting={isReconnecting} onReconnect={handleReconnect} />
  )}
</div>
```

---

## 2. ReconnectButton Component Props

```tsx
interface ReconnectButtonProps {
  /** True while the reconnect RPC call is in-flight. Disables the button. */
  isReconnecting: boolean;
  /** Callback triggered on button click. */
  onReconnect: () => void;
}
```

### Class variants

| State | Classes |
|-------|---------|
| Idle | `text-xs px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-colors duration-150 active:scale-95` |
| Disabled (in-flight) | `text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/30 cursor-not-allowed` |

### Button label

| State | Label |
|-------|-------|
| Idle | `↺ Reconnect` |
| In-flight | `↺ Reconnecting…` |

---

## 3. Local State in ControlBar

```tsx
const [isReconnecting, setIsReconnecting] = useState(false);

async function handleReconnect() {
  if (isReconnecting) return;
  setIsReconnecting(true);
  try {
    await reconnect();
  } catch {
    // connection failure is surfaced via connectionStatus signal; no local error needed
  } finally {
    setIsReconnecting(false);
  }
}
```

---

## 4. api.ts — `reconnect()` function signature

Add to `mods/desktopmate-bridge/ui/src/api.ts`:

```ts
/**
 * Instructs the service to tear down and re-establish the WebSocket connection
 * to the FastAPI backend. Resolution does NOT guarantee a successful connection —
 * callers should observe `connectionStatus` signal for the actual result.
 */
export async function reconnect(): Promise<void> {
  await rpc.call({
    modName: "@hmcs/desktopmate-bridge",
    method: "reconnect",
  });
}
```

---

## 5. service.ts — `reconnect` RPC method interface

The service handler must be registered in `mods/desktopmate-bridge/src/service.ts` (or equivalent RPC dispatch table).

```ts
interface ReconnectRpcMethod {
  method: "reconnect";
  body: undefined;
  returns: void;
}
```

Implementation contract:
1. Close the existing WebSocket connection (if open) cleanly.
2. Set `connectionStatus` to `"disconnected"` while re-initialising.
3. Re-run the existing connection initialisation logic (equivalent to what runs at startup).
4. Update `connectionStatus` to `"connected"` on success or `"disconnected"` on failure.

---

## 6. Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | Reconnect button is **not** rendered when `connectionStatus === "connected"` |
| AC-2 | Reconnect button **is** rendered when `connectionStatus === "disconnected"` |
| AC-3 | Reconnect button **is** rendered when `connectionStatus === "restart-required"` |
| AC-4 | Clicking the button calls `reconnect()` from `api.ts` exactly once |
| AC-5 | Button is disabled and shows `↺ Reconnecting…` while the RPC call is in-flight |
| AC-6 | After `reconnect()` resolves, `isReconnecting` resets to `false` regardless of outcome |
| AC-7 | Glassmorphism style (`bg-white/10`, `border-white/20`, `text-white/80`) matches existing ControlBar palette |
