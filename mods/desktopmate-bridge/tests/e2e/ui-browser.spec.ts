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
