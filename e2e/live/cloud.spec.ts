import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import { AUTH_STORAGE_KEY, authHeaders, cleanUpLiveUser, disableShareSheet, sample, signUpAnonymously, SUPABASE_URL, tempFile, TWO_TONE, type LiveUser } from "../support";

// The real app against the real Supabase project, signed in as a throwaway anonymous account.
test.describe.configure({ mode: "serial" });

let user: LiveUser;
let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

const count = async (table: string) => ((await (await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: authHeaders(user) })).json()) as unknown[]).length;
const storagePaths = async (bucket: string, prefix: string) =>
  ((await (await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, { method: "POST", headers: authHeaders(user), body: JSON.stringify({ prefix, limit: 100 }) })).json()) as { name: string }[]).map((file) => file.name);

test.beforeAll(async ({ browser, baseURL }) => {
  user = await signUpAnonymously();
  context = await browser.newContext({ baseURL, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await disableShareSheet(context);
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // A browser archive exists before signing in.
  await page.goto("/");
  await page.evaluate(([mixes, collections]) => {
    localStorage.clear();
    localStorage.setItem("the-colour-archive-mixes", JSON.stringify(mixes));
    localStorage.setItem("the-colour-archive-collections", JSON.stringify(collections));
  }, [sample.mixes, sample.collections] as const);
});

test.afterAll(async () => {
  await cleanUpLiveUser(user);
  await context?.close();
  expect(pageErrors).toEqual([]);
});

test("signing in offers to move this browser's mixes, and moving them works", async () => {
  await page.evaluate(([key, session]) => localStorage.setItem(key, session), [AUTH_STORAGE_KEY, user.session] as const);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Move this browser/ })).toBeVisible();
  await page.getByRole("button", { name: "Move to my account" }).click();
  await expect(page.getByText("Moved 14 mixes and 3 collections to your account.")).toBeVisible();
  expect([await count("mixes"), await count("collections"), await count("collection_mixes")]).toEqual([14, 3, 13]);
  expect(await page.evaluate(() => localStorage.getItem("the-colour-archive-mixes"))).toBeNull();
});

test("a new mix with a photo saves to the account and the photo displays", async () => {
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill("Cloud photo mix");
  await dialog.getByLabel("Paint name").fill("Mephiston Red");
  await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
  await expect(dialog.locator(".color-sampler-canvas")).toBeVisible();
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(dialog).toBeHidden();
  const image = page.locator('.mix-card img[alt="Photo of Cloud photo mix"]');
  await expect(image).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/mix-photos\//);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("a stored photo can be colour-sampled (CORS)", async () => {
  await page.getByRole("button", { name: "Edit Cloud photo mix" }).click();
  const dialog = page.getByRole("dialog");
  const canvas = dialog.locator(".color-sampler-canvas");
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeGreaterThan(0);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5);
  const hex = await dialog.locator(".color-input-wrap span").first().innerText();
  expect(parseInt(hex.slice(5, 7), 16), `expected blue, got ${hex}`).toBeGreaterThan(150);
  await expect(dialog.getByText(/could not be (prepared|detected|magnified)/)).toHaveCount(0);
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).toBeHidden();
});

let shortUrl = "";
test("sharing that mix makes a short link with the photo", async () => {
  await page.getByRole("button", { name: "Share Cloud photo mix" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#share-link")).toBeVisible();
  shortUrl = await dialog.locator("#share-link").inputValue();
  expect(shortUrl).toMatch(/^http:\/\/localhost:5173\/s\/[A-Za-z0-9]{10}$/);
  await expect(dialog.getByText("Includes 1 photo.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
});

test("a signed-out visitor opens the short link, sees the photo and saves an embedded copy", async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(shortUrl);
  await expect(visitor.getByRole("heading", { level: 1, name: /Cloud photo mix/ })).toBeVisible();
  await expect(visitor.locator(".shared-mix-card img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/share-photos\//);
  await visitor.getByRole("button", { name: "Save mix to my archive" }).click();
  await expect(visitor.getByText("Saved to my archive")).toBeVisible();
  const saved = await visitor.evaluate(() => JSON.parse(localStorage.getItem("the-colour-archive-mixes") || "[]")[0]);
  expect(saved.image).toMatch(/^data:image\//);
  await visitor.context().close();
});

test("removing the photo also deletes the file", async () => {
  await page.getByRole("button", { name: "Edit Cloud photo mix" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).toBeHidden();
  expect(await storagePaths("mix-photos", user.id)).toEqual([]);
});

test("a short link is a snapshot that ignores later edits", async ({ browser }) => {
  await page.getByRole("button", { name: "Edit Cloud photo mix" }).click();
  await page.getByRole("dialog").getByPlaceholder("e.g. Stormy midnight blue").fill("Renamed later");
  await page.getByRole("dialog").getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(shortUrl);
  await expect(visitor.getByRole("heading", { level: 1, name: /Cloud photo mix/ })).toBeVisible();
  await expect(visitor.getByText("Renamed later")).toHaveCount(0);
  await visitor.goto("/s/ZZZZZZZZZZ");
  await expect(visitor.getByText("doesn't exist, or its owner removed it")).toBeVisible();
  await visitor.context().close();
});

test("collections: create, change, delete, and deleting a mix removes its links", async () => {
  await page.getByRole("button", { name: /Add collection/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Woodland bases").fill("Cloud test set");
  await dialog.getByRole("checkbox").nth(0).check();
  await dialog.getByRole("checkbox").nth(1).check();
  await dialog.getByRole("button", { name: /Create collection/ }).click();
  await expect(page.getByText("Collection created.")).toBeVisible();
  await page.getByRole("button", { name: /Manage mixes/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").nth(0).uncheck();
  await dialog.getByRole("button", { name: /Save collection/ }).click();
  await expect(page.locator(".mix-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete collection Cloud test set" }).click();
  await page.getByRole("button", { name: "Delete collection", exact: true }).click();
  await expect(page.getByText("was deleted")).toBeVisible();
  expect(await count("collections")).toBe(3);

  await page.getByRole("link", { name: /go to My archive/ }).click();
  await page.getByRole("button", { name: "Delete Gunmetal" }).click();
  await page.getByRole("button", { name: "Remove mix" }).click();
  await expect(page.getByText("Mix removed")).toBeVisible();
  expect([await count("mixes"), await count("collection_mixes")]).toEqual([14, 12]);
});

const backupFile = tempFile("cloud-backup.json", "");
test("export embeds photos, re-importing adds nothing, and Replace resets the account", async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  await download.saveAs(backupFile);
  const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  expect(data.mixes).toHaveLength(14);
  expect(data.mixes.every((mix: { image: string; imagePath?: string }) => !("imagePath" in mix) && (mix.image === "" || mix.image.startsWith("data:image/")))).toBe(true);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(backupFile);
  await page.getByRole("button", { name: "Add to archive" }).click();
  await expect(page.getByText("14 mixes were already in your archive")).toBeVisible();
  expect(await count("mixes")).toBe(14);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(backupFile);
  await page.getByRole("button", { name: "Replace archive" }).click();
  await expect(page.getByText("Archive replaced")).toBeVisible();
  expect([await count("mixes"), await count("collections")]).toEqual([14, 3]);
});

test("the profile saves a display name for real, and sign-out returns to the browser archive", async () => {
  await page.getByRole("link", { name: /Open profile for/ }).click();
  await page.getByLabel(/Display name/).fill("Test Painter");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /Open profile for Test Painter/ })).toBeVisible();
  await cleanUpLiveUser(user);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator(".saved-status", { hasText: "Saved in this browser" })).toBeVisible();
});
