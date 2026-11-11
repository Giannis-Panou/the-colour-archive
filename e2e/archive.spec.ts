import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import { addMix, disableShareSheet, near, shareFromDialog, stored, tempFile, TWO_TONE } from "./support";

// One browser session walks through the whole app signed out, the way a person would.
// Each test builds on the previous one, so they run in order.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

async function openPage(url = "/") {
  const opened = await context.newPage();
  opened.on("pageerror", (error) => pageErrors.push(error.message));
  await opened.goto(url);
  return opened;
}

test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext({ baseURL, acceptDownloads: true, viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  await disableShareSheet(context);
  page = await openPage();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterAll(async () => {
  await context.close();
  expect(pageErrors, "no uncaught errors in the page").toEqual([]);
});

const card = (name: string) => page.locator(".mix-card", { hasText: name });
/** Opens the Collections tab, then the collection with exactly this name. */
async function openCollection(name: string) {
  await page.getByRole("navigation", { name: "Workshop" }).getByRole("link", { name: "Collections" }).click();
  await page.locator(".collection-card", { has: page.getByText(name, { exact: true }) }).click();
}
async function newCollection() {
  await page.getByRole("navigation", { name: "Workshop" }).getByRole("link", { name: "Collections" }).click();
  await page.getByRole("button", { name: /New collection/ }).first().click();
}

test("empty archive shows the welcome state and Export is disabled", async () => {
  await expect(page.getByText("Your next favourite")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export backup" })).toBeDisabled();
});

test("the mix form checks the name, paints and drop counts", async () => {
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(dialog.getByText("Give your mix a name")).toBeVisible();
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill("Test");
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(dialog.getByText("Add at least one paint")).toBeVisible();
  await dialog.getByLabel("Paint name").fill("Blue");
  for (const bad of ["0", "1.5"]) {
    await dialog.getByLabel("Number of drops").fill(bad);
    await dialog.getByRole("button", { name: /Save mix/ }).click();
    expect(await dialog.getByLabel("Number of drops").evaluate((input: HTMLInputElement) => !input.validity.valid)).toBe(true);
    await expect(dialog).toBeVisible();
  }
});

test("Escape closes the mix form and returns focus to the button that opened it", async () => {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: /New colour mix/ })).toBeFocused();
});

test("new mixes render, are saved and survive a reload", async () => {
  await addMix(page, { name: "Stormy blue", paints: [["Kraken Ink", "The Army Painter", "3"], ["Abaddon Black", "Citadel", "1"]], notes: "Great for cloaks" });
  await expect(page.getByText("Mix saved to your archive")).toBeVisible();
  await addMix(page, { name: "Autumn rust", paints: [["Rust", "Vallejo", "2"]] });
  await addMix(page, { name: "Bone white", paints: [["Skeleton Bone", "The Army Painter", "4"]] });
  expect((await stored(page)).mixes).toHaveLength(3);
  await page.reload();
  await expect(page.locator(".mix-card")).toHaveCount(3);
  await expect(page.getByText("Great for cloaks")).toBeVisible();
});

test("the summary counts unique paints", async () => {
  await expect(page.locator(".summary-card").nth(1)).toContainText(/4\s*unique paints/);
});

test("search covers names, notes, paints and brands", async () => {
  const search = page.getByLabel("Search mixes");
  await search.fill("vallejo");
  await expect(page.locator(".mix-card")).toHaveCount(1);
  await search.fill("cloaks");
  await expect(page.locator(".mix-card h3").first()).toHaveText("Stormy blue");
  await search.fill("zzzz");
  await expect(page.getByText("No mixes found")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(page.locator(".mix-card")).toHaveCount(3);
});

test("sort orders by newest, oldest, name and colour", async () => {
  const sort = page.getByLabel("Sort mixes");
  await expect(page.locator(".mix-card h3").first()).toHaveText("Bone white");
  await sort.selectOption({ label: "Name A–Z" });
  await expect(page.locator(".mix-card h3")).toHaveText(["Autumn rust", "Bone white", "Stormy blue"]);
  await sort.selectOption({ label: "Oldest first" });
  await expect(page.locator(".mix-card h3")).toHaveText(["Stormy blue", "Autumn rust", "Bone white"]);
  await sort.selectOption({ label: "Newest first" });
});

test("editing a mix keeps its id and date", async () => {
  const before = (await stored(page)).mixes.find((mix) => mix.name === "Autumn rust");
  await page.getByRole("button", { name: "Edit Autumn rust" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill("Autumn rust v2");
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText("Mix updated")).toBeVisible();
  const after = (await stored(page)).mixes.find((mix) => mix.name === "Autumn rust v2");
  expect(after).toMatchObject({ id: before?.id, createdAt: before?.createdAt });
});

test("a photo can be added and sampled by pointer and by keyboard", async () => {
  await page.getByRole("button", { name: "Edit Bone white" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
  const canvas = dialog.locator(".color-sampler-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (document.querySelector(".color-sampler-canvas") as HTMLCanvasElement | null)?.width);
  const box = (await canvas.boundingBox())!;
  const hex = dialog.locator(".color-input-wrap span").first();

  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect(dialog.locator(".color-magnifier")).toBeVisible();
  await page.mouse.up();
  expect(near(await hex.innerText(), [220, 30, 30]), "left half is red").toBe(true);

  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  expect(near(await hex.innerText(), [30, 60, 200]), "right half is blue").toBe(true);

  await canvas.focus();
  for (let step = 0; step < 40; step++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  expect(near(await hex.innerText(), [220, 30, 30]), "keyboard moved back to red").toBe(true);

  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).toBeHidden();
  const saved = (await stored(page)).mixes.find((mix) => mix.name === "Bone white");
  expect(saved?.image.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(near(saved!.color, [220, 30, 30])).toBe(true);
  await page.reload();
  await expect(page.locator('.mix-card img[alt="Photo of Bone white"]')).toHaveCount(1);
});

test("a removed photo can be chosen again", async () => {
  await page.getByRole("button", { name: "Edit Bone white" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
  await expect(dialog.locator(".color-sampler-canvas")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a card switches between the photo and the saved colour", async () => {
  await card("Bone white").getByRole("button", { name: "Show saved colour" }).click();
  await expect(card("Bone white").locator("img")).toHaveCount(0);
  await card("Bone white").getByRole("button", { name: "Show mix photo" }).click();
  await expect(card("Bone white").locator("img")).toHaveCount(1);
});

test("creating a collection checks the name and opens it", async () => {
  await newCollection();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Create collection/ }).click();
  await expect(dialog.getByText("Give your collection a name")).toBeVisible();
  await dialog.getByPlaceholder("e.g. Woodland bases").fill("Cloaks");
  await dialog.getByRole("checkbox").nth(0).check();
  await dialog.getByRole("checkbox").nth(1).check();
  await dialog.getByRole("button", { name: /Create collection/ }).click();
  await expect(page.getByText("Collection created")).toBeVisible();
  await expect(page).toHaveURL(/\/collections\/[\w-]+$/);
  await expect(page.locator(".mix-card")).toHaveCount(2);
  await expect(page.locator("h1")).toHaveText(/^Cloaks/);
});

test("the Collections tab lists collections, and New collection starts empty", async () => {
  await page.getByRole("link", { name: "All collections" }).click();
  await expect(page).toHaveURL(/\/collections$/);
  await expect(page.locator(".collection-card", { hasText: "Cloaks" })).toContainText("2 mixes");
  await page.getByRole("button", { name: /New collection/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("h2")).toHaveText(/^Add a collection/);
  await expect(dialog.getByPlaceholder("e.g. Woodland bases")).toHaveValue("");
  await page.keyboard.press("Escape");
});

test("collection names must be unique, ignoring capitals", async () => {
  await newCollection();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Woodland bases").fill("cloaks");
  await dialog.getByRole("button", { name: /Create collection/ }).click();
  await expect(dialog.getByText("already exists")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Manage mixes changes which mixes are in a collection", async () => {
  await openCollection("Cloaks");
  await page.getByRole("button", { name: /Manage mixes/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").nth(2).check();
  await dialog.getByRole("button", { name: /Save collection/ }).click();
  await expect(page.getByText("Collection updated")).toBeVisible();
  await expect(page.locator(".mix-card")).toHaveCount(3);
  await page.getByRole("link", { name: "All collections" }).click();
  await expect(page.locator(".collection-card", { hasText: "Cloaks" })).toContainText("3 mixes");
  await page.getByRole("navigation", { name: "Workshop" }).getByRole("link", { name: "Mixes" }).click();
});

test("a deleted mix leaves its collections too", async () => {
  await page.getByRole("button", { name: "Delete Autumn rust v2" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.locator(".mix-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Delete Autumn rust v2" }).click();
  await page.getByRole("button", { name: "Remove mix" }).click();
  await expect(page.getByText("Mix removed")).toBeVisible();
  const data = await stored(page);
  expect(data.mixes).toHaveLength(2);
  expect(data.collections[0].mixIds).toHaveLength(2);
});

let shareUrl = "";
test("sharing a mix makes a compressed link and copies it", async () => {
  shareUrl = await shareFromDialog(page, page.getByRole("button", { name: "Share Stormy blue" }));
  expect(shareUrl).toMatch(/^http:\/\/localhost:5173\/#s=[A-Za-z0-9_-]+$/);
  expect(shareUrl.length).toBeLessThan(400);
});

test("old #share= links still open", async () => {
  const legacy = `/#share=${encodeURIComponent(JSON.stringify({ version: 1, kind: "mix", mix: { name: "Legacy mix", color: "#123456", notes: "", image: "", paints: [{ name: "Old Paint", brand: "Citadel", drops: "2", swatch: "#000000" }] } }))}`;
  const opened = await openPage(legacy);
  await expect(opened.getByRole("heading", { level: 1, name: /Legacy mix/ })).toBeVisible();
  await opened.close();
});

test("a shared mix opens and can be saved", async () => {
  const opened = await openPage(shareUrl);
  await expect(opened.getByText("A COLOUR MIX TO TRY")).toBeVisible();
  await expect(opened.getByText("Kraken Ink")).toBeVisible();
  await opened.getByRole("button", { name: "Save mix to my archive" }).click();
  await expect(opened.getByText("Saved to my archive")).toBeVisible();
  expect((await stored(opened)).mixes).toHaveLength(3);
  await opened.close();
  await page.goto("/");
});

test("a shared collection saves as '(shared)' when the name is taken", async () => {
  await openCollection("Cloaks");
  const url = await shareFromDialog(page, page.getByRole("button", { name: /Share collection/ }));
  const opened = await openPage(url);
  await expect(opened.getByText("A COLLECTION TO EXPLORE")).toBeVisible();
  await expect(opened.locator(".shared-mix-card")).toHaveCount(2);
  await opened.getByRole("button", { name: "Save collection to my archive" }).click();
  await expect(opened.getByText("Collection saved")).toBeVisible();
  expect((await stored(opened)).collections).toContainEqual(expect.objectContaining({ name: "Cloaks (shared)", mixIds: expect.arrayContaining([expect.any(String)]) }));
  await opened.close();
  await page.goto("/");
});

test("a broken share link shows an error page", async () => {
  const opened = await openPage("/#share=%7Bnot-json");
  await expect(opened.getByText("This share link is unavailable")).toBeVisible();
  await opened.close();
});

test("changing the address to a share link switches view without a reload", async () => {
  await page.goto("/");
  await page.evaluate((hash) => { location.hash = hash; }, new URL(shareUrl).hash);
  await expect(page.getByText("A COLOUR MIX TO TRY")).toBeVisible();
  await page.getByRole("link", { name: "Open my archive" }).click();
  await expect(page.getByText("Your colour mixes")).toBeVisible();
});

const backupFile = tempFile("backup.json", "");
test("Export downloads a complete backup", async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  await download.saveAs(backupFile);
  const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  const current = await stored(page);
  expect(data).toMatchObject({ app: "the-colour-archive", version: 2 });
  expect(data.mixes).toHaveLength(current.mixes.length);
  expect(data.collections).toHaveLength(current.collections.length);
  expect(download.suggestedFilename()).toMatch(/^colour-archive-\d{4}-\d{2}-\d{2}\.json$/);
});

test("Import refuses files that aren't backups", async () => {
  const input = page.locator('input[type="file"][accept*="json"]');
  await input.setInputFiles(tempFile("not-json.json", "hello"));
  await expect(page.getByText("could not be read as JSON")).toBeVisible();
  await input.setInputFiles(tempFile("wrong.json", JSON.stringify({ app: "x", mixes: [], collections: [] })));
  await expect(page.getByText("isn’t a Colour Archive backup")).toBeVisible();
});

test("adding a backup again creates no duplicates", async () => {
  const before = (await stored(page)).mixes.length;
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(backupFile);
  await page.getByRole("button", { name: "Add to archive" }).click();
  await expect(page.getByText("already in your archive")).toBeVisible();
  expect((await stored(page)).mixes).toHaveLength(before);
});

test("Replace restores a backup into an empty browser", async () => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(backupFile);
  await page.getByRole("button", { name: "Replace archive" }).click();
  await expect(page.getByText("Archive replaced")).toBeVisible();
  const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  const current = await stored(page);
  expect(current.mixes).toHaveLength(data.mixes.length);
  expect(current.collections).toHaveLength(data.collections.length);
});

test("deleting a collection keeps its mixes", async () => {
  const before = (await stored(page)).mixes.length;
  await openCollection("Cloaks (shared)");
  await page.getByRole("button", { name: "Delete collection Cloaks (shared)" }).click();
  await page.getByRole("button", { name: "Delete collection", exact: true }).click();
  await expect(page.getByText("was deleted")).toBeVisible();
  // Deleting a collection returns to the list of collections.
  await expect(page).toHaveURL(/\/collections$/);
  const current = await stored(page);
  expect(current.mixes).toHaveLength(before);
  expect(current.collections.map((collection) => collection.name)).not.toContain("Cloaks (shared)");
});

test("damaged saved mixes are skipped, reported and kept in a recovery copy", async () => {
  await page.evaluate(() => {
    const mixes = JSON.parse(localStorage.getItem("the-colour-archive-mixes") || "[]");
    mixes.push({ name: 5 });
    localStorage.setItem("the-colour-archive-mixes", JSON.stringify(mixes));
  });
  await page.reload();
  await expect(page.getByText("damaged and could not be shown")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("the-colour-archive-mixes-recovery"))).not.toBeNull();
});

test("the desktop sidebar collapses and expands", async () => {
  await page.getByRole("button", { name: "Collapse collections sidebar" }).click();
  await expect(page.locator(".app-shell.desktop-sidebar-collapsed")).toHaveCount(1);
  await page.getByRole("button", { name: "Expand collections sidebar" }).click();
});

test("the logo returns to My archive, and Back returns to the collection", async () => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("the-colour-archive-collections", JSON.stringify([{ id: "c9", name: "Logo test", mixIds: [] }])));
  await page.reload();
  await openCollection("Logo test");
  await expect(page).toHaveURL(/\/collections\/c9$/);
  await expect(page.locator("h1")).toHaveText(/^Logo test/);
  await page.getByRole("link", { name: /go to My archive/ }).click();
  await expect(page.locator("h1")).toHaveText(/^My archive/);
  await expect(page).toHaveURL("http://localhost:5173/");
  await page.goBack();
  await expect(page.locator("h1")).toHaveText(/^Logo test/);
});

test("unknown addresses lead back to the archive, and a missing collection to the collections", async () => {
  await page.goto("/collections/does-not-exist");
  await expect(page).toHaveURL("http://localhost:5173/collections");
  await page.goto("/no/such/page");
  await expect(page).toHaveURL("http://localhost:5173/");
  await page.goto("/profile");
  await expect(page).toHaveURL("http://localhost:5173/");
});

test("on a phone the Collections tab opens the list, a card opens the collection, and nothing scrolls sideways", async ({ browser, baseURL }) => {
  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const mobile = await phone.newPage();
  await mobile.goto("/");
  await mobile.evaluate(() => localStorage.setItem("the-colour-archive-collections", JSON.stringify([{ id: "c1", name: "Mobile set", mixIds: [] }])));
  await mobile.reload();
  await mobile.getByRole("navigation", { name: "Workshop" }).getByRole("link", { name: "Collections" }).click();
  await expect(mobile).toHaveURL(/\/collections$/);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await mobile.locator(".collection-card", { hasText: "Mobile set" }).click();
  await expect(mobile).toHaveURL(/\/collections\/c1$/);
  await expect(mobile.locator("h1")).toHaveText(/^Mobile set/);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await phone.close();
});
