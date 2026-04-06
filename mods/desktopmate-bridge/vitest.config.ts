import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "ui/src/**/*.test.ts", "ui/src/**/*.test.tsx"],
  },
});
