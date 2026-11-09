import { defineConfig } from "@playwright/test";

// Uses the installed Google Chrome by default. To use Playwright's own Chromium instead,
// run `npx playwright install chromium` once and set PLAYWRIGHT_BUNDLED_BROWSER=1.
const channel = process.env.PLAYWRIGHT_BUNDLED_BROWSER ? undefined : "chrome";

/**
 * Browser tests.
 * - archive, account, accessibility: against the dev server, signed out or with a mocked account
 * - security: against the production build, served with the exact headers from netlify.toml
 * The live Supabase tests have their own config: playwright.live.config.ts.
 */
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["live/**"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: { channel, viewport: { width: 1280, height: 900 } },
  projects: [
    { name: "app", testIgnore: ["security.spec.ts", "live/**"], use: { baseURL: "http://localhost:5173" } },
    { name: "security", testMatch: ["security.spec.ts"], use: { baseURL: "http://localhost:4173" } },
  ],
  webServer: [
    { command: "npm run dev -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: true },
    { command: "npm run build && npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true, timeout: 120_000 },
  ],
});
