import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure domain tests do not need React transforms or the production service worker.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.{ts,mjs}"], exclude: ["test/e2e/**"] },
});
