import { defineConfig } from "vitest/config";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve @hmcs/sdk to the nearest built dist/index.js.
// - In the main repo: packages/sdk is 2 levels up (mods/character-settings → repo root)
// - In a git worktree: packages/sdk is 4 levels up (worktrees/<branch>/mods/character-settings → repo root)
function resolveSDK(): string {
  const candidates = [
    path.resolve(__dirname, "../../packages/sdk/dist/index.js"),
    path.resolve(__dirname, "../../../../packages/sdk/dist/index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    "Cannot resolve @hmcs/sdk. Run `pnpm build` from the repo root first."
  );
}

export default defineConfig({
  resolve: {
    alias: {
      "@hmcs/sdk": resolveSDK(),
    },
  },
  test: {
    include: ["ui/src/**/*.test.ts", "ui/src/**/*.test.tsx"],
    environment: "happy-dom",
  },
});
