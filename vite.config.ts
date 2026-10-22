import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // src/app.tsx registers /sw.js itself; public/manifest.webmanifest stays hand-written.
    VitePWA({
      injectRegister: false,
      manifest: false,
      workbox: {
        cacheId: "holdfast",
        globPatterns: ["**/*"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: { host: "127.0.0.1", port: 4319, strictPort: true },
  build: { target: "es2022" },
});
