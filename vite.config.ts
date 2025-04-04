import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Add proxy for the live API
  server: {
    proxy: {
      "/api": {
        target: "https://app.seesea.cz",
        changeOrigin: true,
        secure: false,
      },
    },
    host: "0.0.0.0",
    strictPort: true,
    cors: true,
    hmr: {
      clientPort: 443,
    },
    allowedHosts: ["clvpwr.dev"],
  },
});
