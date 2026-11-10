import { expect, test } from "@playwright/test";
import { disableShareSheet, HAS_SUPABASE, mockSignedIn } from "./support";

test.skip(!HAS_SUPABASE, "Accounts need VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see the README).");

test.describe("sign-in dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Sign in to sync your archive" }).click();
  });

  test("opens on Password, with a show/hide toggle", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: /Password/ })).toHaveAttribute("aria-selected", "true");
    await dialog.getByLabel("Password", { exact: true }).fill("secret123");
    await expect(dialog.locator("#sign-in-password")).toHaveAttribute("type", "password");
    await dialog.getByRole("button", { name: "Show password" }).click();
    await expect(dialog.locator("#sign-in-password")).toHaveAttribute("type", "text");
  });

  test("a wrong password gets a clear message (real Supabase call; sends no email)", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill("nobody.colour.archive.test@example.com");
    await dialog.getByLabel("Password", { exact: true }).fill("not-the-password");
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(dialog.getByText("That email and password don't match")).toBeVisible({ timeout: 15_000 });
  });

  test("creating an account checks the password length before contacting Supabase", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create an account" }).click();
    await expect(dialog.getByRole("heading", { name: /Create your account/i })).toBeVisible();
    await dialog.getByLabel("Email address").fill("someone@example.com");
    await dialog.getByLabel("Password", { exact: true }).fill("short");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByText("Use at least 8 characters")).toBeVisible();
  });

  test("Forgot password and Email link switch views", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Forgot password?" }).click();
    await expect(dialog.getByRole("heading", { name: /Reset your password/i })).toBeVisible();
    await expect(dialog.locator("#sign-in-password")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Back" }).click();
    await dialog.getByRole("tab", { name: /Email link/ }).click();
    await expect(dialog.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(dialog.locator("#sign-in-password")).toHaveCount(0);
  });

  test("Tab stays inside the open dialog", async ({ page }) => {
    for (let step = 0; step < 15; step++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }
  });
});

test.describe("signed in (mocked account)", () => {
  test("loads the archive from the account, and the profile shows details and stats", async ({ page, context }) => {
    await mockSignedIn(context);
    await page.goto("/");
    await expect(page.getByText("Synced to your account")).toBeVisible();
    await expect(page.locator(".mix-card")).toHaveCount(14);
    await page.getByRole("link", { name: /Open profile for giannis/ }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { level: 1, name: /giannis/i })).toBeVisible();
    await expect(page.locator(".profile-stats .summary-card strong")).toHaveText(["14", "3", "0", "26"]);
    await expect(page.locator(".breadcrumb")).toContainText("Profile");
    await expect(page.locator(".profile-palette li")).toHaveCount(8);
    await expect(page.getByText("giannis@example.com").first()).toBeVisible();
  });

  test("saving a display name updates the account and the header", async ({ page, context }) => {
    const { updates } = await mockSignedIn(context);
    await page.goto("/profile");
    await page.getByLabel(/Display name/).fill("Giannis P.");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Name saved.")).toBeVisible();
    expect(updates).toContainEqual(expect.objectContaining({ data: { display_name: "Giannis P." } }));
    await expect(page.getByRole("heading", { level: 1, name: /Giannis P\./ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open profile for Giannis P\./ })).toBeVisible();
  });

  test("the password form checks length and matching, then saves", async ({ page, context }) => {
    const { updates } = await mockSignedIn(context);
    await page.goto("/profile");
    await page.locator("#profile-new-password").fill("short");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await page.locator("#profile-new-password").fill("paint-desk-2026");
    await page.locator("#profile-confirm-password").fill("paint-desk-2025");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("The two passwords don't match.")).toBeVisible();
    await page.locator("#profile-confirm-password").fill("paint-desk-2026");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Password saved.")).toBeVisible();
    expect(updates).toContainEqual(expect.objectContaining({ password: "paint-desk-2026" }));
  });

  test("Back, the logo and the browser's Back button all leave the profile", async ({ page, context }) => {
    await mockSignedIn(context);
    await page.goto("/");
    await page.getByRole("link", { name: /Open profile for/ }).click();
    await page.getByRole("link", { name: "Back to my archive" }).click();
    await expect(page.locator(".mix-card").first()).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole("link", { name: /go to My archive/ }).click();
    await expect(page.locator(".mix-card").first()).toBeVisible();
  });

  test("the profile fits a phone screen", async ({ page, context }) => {
    await mockSignedIn(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile");
    await expect(page.locator(".profile-card").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test("signing out returns to the browser archive", async ({ page, context }) => {
    await mockSignedIn(context);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("http://localhost:5173/");
    await expect(page.locator(".saved-status", { hasText: "Saved in this browser" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to sync your archive" })).toBeVisible();
  });

  test("Escape closes only the top dialog when one opens from another", async ({ page, context }) => {
    await disableShareSheet(context);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /New colour mix/ }).click();
    await page.getByRole("dialog").getByPlaceholder("e.g. Stormy midnight blue").fill("Quick");
    await page.getByRole("dialog").getByLabel("Paint name").fill("Red");
    await page.getByRole("dialog").getByRole("button", { name: /Save mix/ }).click();
    await page.getByRole("button", { name: "Share Quick" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("an account whose database hasn't had the update yet still loads its mixes, with a clear note", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await mockSignedIn(context, { missingWorkshopTables: true });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".mix-card")).toHaveCount(14);
  await expect(page.getByText("need a database update")).toBeVisible();
  await page.goto("/recipes");
  await expect(page.getByText("Write down your first scheme")).toBeVisible();
  await context.close();
});
