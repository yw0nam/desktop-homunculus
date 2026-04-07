/**
 * Playwright UI E2E tests for desktopmate-bridge ControlBar + SettingsPanel.
 *
 * Prerequisites:
 *   Playwright installed: cd ui && pnpm install (installs @playwright/test)
 *   Browser binaries:    npx playwright install chromium
 *
 * Run (from mods/desktopmate-bridge/ui/):
 *   pnpm playwright
 *   VITE_TEST_MODE=true pnpm dev  (manual dev server, then) pnpm playwright
 *
 * The Playwright config (ui/playwright.config.ts) starts the Vite dev server
 * automatically with VITE_TEST_MODE=true, which replaces @hmcs/sdk and
 * @hmcs/sdk/rpc with in-memory mocks. Signals can be triggered from tests
 * via page.evaluate(() => window.__signalBus__.emit(...)).
 */
import { test, expect } from "@playwright/test";

// TC-UI-01: ステータス表示確認 — 초기 상태 "✖ Disconnected"
test("TC-UI-01: initial status shows ✖ Disconnected", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("✖ Disconnected")).toBeVisible({ timeout: 5000 });
});

// TC-UI-02: dm-connection-status 시그널 → "✔ Connected" 표시, Reconnect 버튼 숨김
test("TC-UI-02: dm-connection-status signal updates UI to ✔ Connected", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("✖ Disconnected")).toBeVisible({ timeout: 5000 });

  await page.evaluate(() => {
    window.__signalBus__.emit("dm-connection-status", { status: "connected" });
  });

  await expect(page.getByText("✔ Connected")).toBeVisible({ timeout: 3000 });
  await expect(page.locator('[title="Reconnect"]')).not.toBeVisible();
});

// TC-UI-03: 설정 패널 저장 → "✔ Saved" 표시
test("TC-UI-03: settings panel save shows ✔ Saved", async ({ page }) => {
  await page.goto("/");

  await page.locator('[title="Settings"]').click();

  const panel = page.locator('[data-testid="settings-panel"]');
  await expect(panel).toBeVisible({ timeout: 3000 });

  const userIdInput = panel.locator('input').first();
  await userIdInput.fill("playwright-user");

  await panel.getByRole("button", { name: "Save" }).click();

  await expect(panel.getByText("✔ Saved")).toBeVisible({ timeout: 3000 });
});

// TC-UI-04: Reconnect 버튼 디바운스 — 클릭 중 "↺ Reconnecting…" 표시, 중복 클릭 방지
test("TC-UI-04: reconnect button shows Reconnecting… while in-flight and blocks re-click", async ({
  page,
}) => {
  await page.goto("/");

  // Slow down reconnect so we can observe the in-flight state
  await page.evaluate(() => {
    window.__reconnectDelay__ = 2000;
  });

  const reconnectBtn = page.locator('[title="Reconnect"]');
  await expect(reconnectBtn).toBeVisible({ timeout: 5000 });
  await expect(reconnectBtn).toHaveText("↺ Reconnect");

  await reconnectBtn.click();

  // Button must immediately show Reconnecting… and be disabled
  await expect(reconnectBtn).toHaveText("↺ Reconnecting…", { timeout: 500 });
  await expect(reconnectBtn).toBeDisabled();

  // Second click must be ignored — reconnectCallCount stays at 1
  await reconnectBtn.click({ force: true }); // force bypasses disabled check in Playwright
  const count = await page.evaluate(() => window.__reconnectCallCount__);
  expect(count).toBe(1);

  // After delay resolves, button returns to idle
  await expect(reconnectBtn).toHaveText("↺ Reconnect", { timeout: 5000 });
  await expect(reconnectBtn).toBeEnabled();
});

// TC-UI-05: 잘못된 URL 저장 → reconnect 실패 → "✖ Disconnected" 표시
// Core bug scenario: bad URL saved → reconnect attempt → connection stays disconnected
test("TC-UI-05: invalid WS URL save then reconnect shows ✖ Disconnected", async ({
  page,
}) => {
  await page.goto("/");

  // Open settings panel
  await page.locator('[title="Settings"]').click();
  const panel = page.locator('[data-testid="settings-panel"]');
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Enter invalid WS URL
  const wsUrlInput = panel.locator('input').nth(3);
  await wsUrlInput.fill("ws://invalid-host:9999/v1/chat/stream");

  // Save — mock updateConfig stores the bad URL and emits dm-config
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("✔ Saved")).toBeVisible({ timeout: 3000 });

  // Emit disconnected status so reconnect button is visible
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-connection-status", { status: "disconnected" });
  });

  // Click reconnect — mock reconnect detects invalid URL and emits disconnected
  const reconnectBtn = page.locator('[title="Reconnect"]');
  await expect(reconnectBtn).toBeVisible({ timeout: 3000 });
  await reconnectBtn.click();

  // UI must show ✖ Disconnected (reconnect failed due to invalid URL)
  await expect(page.getByText("✖ Disconnected")).toBeVisible({ timeout: 5000 });
});

// TC-UI-06: 메시지 Send 플로우 — 사용자가 입력 후 전송 시 user 버블과 RPC 호출 확인
test("TC-UI-06: send message shows user bubble and tracks via __sentMessages__", async ({
  page,
}) => {
  await page.goto("/");

  // Reset sent messages tracker
  await page.evaluate(() => {
    window.__sentMessages__ = [];
  });

  // Set connected status
  await page.evaluate(() => {
    window.__connectionStatus__ = "connected";
    window.__signalBus__.emit("dm-connection-status", { status: "connected" });
  });
  await expect(page.getByText("✔ Connected")).toBeVisible({ timeout: 3000 });

  // Type message
  await page.locator('input[placeholder="Enter message..."]').fill("Hello backend");

  // Open ChatWindow
  await page.locator('[title="Chat History"]').click();

  // Send
  await page.getByRole("button", { name: "Send" }).click();

  // User bubble visible in ChatWindow
  await expect(page.getByText("Hello backend")).toBeVisible({ timeout: 3000 });

  // RPC was called with correct content
  const sentContent = await page.evaluate(() => window.__sentMessages__[0]?.content);
  expect(sentContent).toBe("Hello backend");

  // Input cleared after send
  const inputValue = await page.locator('input[placeholder="Enter message..."]').inputValue();
  expect(inputValue).toBe("");
});

// TC-UI-07: 스트리밍 응답이 UI에 점진적으로 렌더링
test("TC-UI-07: streaming tokens render progressively in ChatWindow", async ({
  page,
}) => {
  await page.goto("/");

  // Set connected status
  await page.evaluate(() => {
    window.__connectionStatus__ = "connected";
    window.__signalBus__.emit("dm-connection-status", { status: "connected" });
  });
  await expect(page.getByText("✔ Connected")).toBeVisible({ timeout: 3000 });

  // Open ChatWindow
  await page.locator('[title="Chat History"]').click();

  // Emit typing-start — assistant starts typing
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-typing-start", { turn_id: "turn-1", session_id: "sess-1" });
  });

  // Typing indicator "..." or streaming cursor visible
  await expect(page.locator('.animate-pulse, .bg-white\\/10').first()).toBeVisible({ timeout: 3000 });

  // First token
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-stream-token", { turn_id: "turn-1", chunk: "Hello" });
  });
  await expect(page.getByText(/Hello/)).toBeVisible({ timeout: 3000 });

  // Second token — text accumulates
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-stream-token", { turn_id: "turn-1", chunk: " world" });
  });
  await expect(page.getByText(/Hello world/)).toBeVisible({ timeout: 3000 });

  // Streaming cursor (.animate-pulse) still visible during streaming
  await expect(page.locator(".animate-pulse")).toBeVisible({ timeout: 3000 });

  // Finalize message
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-message-complete", {
      turn_id: "turn-1",
      session_id: "sess-1",
      content: "Hello world",
    });
  });

  // Streaming cursor gone after finalize
  await expect(page.locator(".animate-pulse")).not.toBeVisible({ timeout: 3000 });

  // Final text still visible
  await expect(page.getByText(/Hello world/)).toBeVisible({ timeout: 3000 });
});

// TC-UI-08: TTS chunk 수신 갯수가 백엔드 전송 갯수와 일치
test("TC-UI-08: TTS chunk counter matches number of dm-tts-chunk signals emitted", async ({
  page,
}) => {
  await page.goto("/");

  // Reset TTS chunk counter
  await page.evaluate(() => {
    window.__ttsChunkCount__ = 0;
  });

  // Set connected status
  await page.evaluate(() => {
    window.__connectionStatus__ = "connected";
    window.__signalBus__.emit("dm-connection-status", { status: "connected" });
  });
  await expect(page.getByText("✔ Connected")).toBeVisible({ timeout: 3000 });

  // Start streaming to create a message context
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-typing-start", { turn_id: "turn-tts", session_id: "sess-1" });
  });

  // Emit 3 TTS chunks
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 0, text: "chunk0", emotion: "neutral" });
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 1, text: "chunk1", emotion: "neutral" });
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 2, text: "chunk2", emotion: "neutral" });
  });

  // Counter must match 3 (backend sent 3, UI received 3)
  const count = await page.evaluate(() => window.__ttsChunkCount__);
  expect(count).toBe(3);
});

// TC-UI-09: 풀 턴 플로우 (send → streaming → TTS → finalize)
test("TC-UI-09: full turn flow send → streaming → TTS → finalize", async ({
  page,
}) => {
  await page.goto("/");

  // Reset trackers
  await page.evaluate(() => {
    window.__sentMessages__ = [];
    window.__ttsChunkCount__ = 0;
  });

  // Set connected status
  await page.evaluate(() => {
    window.__connectionStatus__ = "connected";
    window.__signalBus__.emit("dm-connection-status", { status: "connected" });
  });
  await expect(page.getByText("✔ Connected")).toBeVisible({ timeout: 3000 });

  // Open ChatWindow
  await page.locator('[title="Chat History"]').click();

  // Send user message
  await page.locator('input[placeholder="Enter message..."]').fill("What is 2+2?");
  await page.getByRole("button", { name: "Send" }).click();

  // User bubble visible
  await expect(page.getByText("What is 2+2?")).toBeVisible({ timeout: 3000 });

  // RPC content correct
  const sentContent = await page.evaluate(() => window.__sentMessages__[0]?.content);
  expect(sentContent).toBe("What is 2+2?");

  // Backend emits typing-start
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-typing-start", { turn_id: "turn-full", session_id: "sess-1" });
  });

  // Streaming tokens
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-stream-token", { turn_id: "turn-full", chunk: "The answer is " });
    window.__signalBus__.emit("dm-stream-token", { turn_id: "turn-full", chunk: "4" });
  });
  await expect(page.getByText(/The answer is 4/)).toBeVisible({ timeout: 3000 });

  // TTS chunks (BACKEND_TTS_CHUNKS = 3)
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 0, text: "The answer", emotion: "neutral" });
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 1, text: " is", emotion: "neutral" });
    window.__signalBus__.emit("dm-tts-chunk", { sequence: 2, text: " 4", emotion: "neutral" });
  });

  // Finalize
  await page.evaluate(() => {
    window.__signalBus__.emit("dm-message-complete", {
      turn_id: "turn-full",
      session_id: "sess-1",
      content: "The answer is 4",
    });
  });

  // Streaming cursor gone
  await expect(page.locator(".animate-pulse")).not.toBeVisible({ timeout: 3000 });

  // TTS chunk count matches backend (3)
  const ttsCount = await page.evaluate(() => window.__ttsChunkCount__);
  expect(ttsCount).toBe(3);
});
