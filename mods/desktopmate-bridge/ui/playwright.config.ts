import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: ["**/*.spec.ts"],
  reporter: [["list"], ["html"]],
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "VITE_TEST_MODE=true pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
    cwd: ".",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
