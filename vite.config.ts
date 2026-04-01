import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles",
              expiration: { maxEntries: 500, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: "SeeSea 2.0",
        short_name: "SeeSea",
        start_url: "/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          "mapbox-gl": ["mapbox-gl"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
    host: "0.0.0.0",
    strictPort: true,
    cors: true,
    hmr: {
      clientPort: 443,
    },
    allowedHosts: ["clvpwr.dev", "seesea.tlkt.me"],
  },
});
