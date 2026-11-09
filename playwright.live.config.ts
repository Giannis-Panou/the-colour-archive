import { defineConfig } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_BUNDLED_BROWSER ? undefined : "chrome";

/**
 * Tests against the real Supabase project: cloud sync, short links, and the database security
 * (row-level security, SQL injection). They create throwaway anonymous accounts and delete what
 * those accounts saved, so anonymous sign-in must be switched on while they run:
 * Supabase → Authentication → Sign In / Providers → Allow anonymous sign-ins.
 */
export default defineConfig({
  testDir: "e2e/live",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { channel, baseURL: "http://localhost:5173", viewport: { width: 1300, height: 900 } },
  webServer: { command: "npm run dev -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: true },
});
