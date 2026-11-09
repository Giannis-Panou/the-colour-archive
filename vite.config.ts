/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than the app, so separate files stay cached between releases.
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: {
    // Unit tests only; the browser tests in e2e/ run with Playwright.
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
});
