import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Add proxy for the live API
  server: {
    proxy: {
      "/seesea": {
        target: "https://app.seesea.cz",
        changeOrigin: true,
      },
    },
  },
});
