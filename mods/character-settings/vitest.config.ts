import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@hmcs/sdk": path.resolve(
        __dirname,
        "../../../../packages/sdk/dist/index.js"
      ),
    },
  },
  test: {
    include: ["ui/src/**/*.test.ts", "ui/src/**/*.test.tsx"],
    environment: "happy-dom",
  },
});
