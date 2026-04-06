import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const testModeAliases = process.env["VITE_TEST_MODE"]
  ? {
      "@hmcs/sdk": resolve(__dirname, "./test/mock-sdk/index.ts"),
      "@hmcs/sdk/rpc": resolve(__dirname, "./test/mock-sdk/rpc.ts"),
    }
  : {};

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: testModeAliases,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
  },
});
