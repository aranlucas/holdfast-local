import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@test": fileURLToPath(new URL("./test", import.meta.url)),
      },
    },

    test: { include: ["test/**/*.test.{ts,mjs}"], exclude: ["test/e2e/**"] },
  }),
);
