import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/config.js": "http://127.0.0.1:3000",
    },
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    rollupOptions: {
      output: { manualChunks: { supabase: ["@supabase/supabase-js"] } },
    },
  },
});
