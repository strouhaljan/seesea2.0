import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
