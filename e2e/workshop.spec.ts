import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import { near, sample, TWO_TONE } from "./support";

// Favourites, filters, colour matching, My paints, the shopping list, recipes, projects and the
// theme, signed out. One browser session builds on each step, so the tests run in order.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext({ baseURL, acceptDownloads: true, viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.evaluate((mixes) => {
    localStorage.clear();
    localStorage.setItem("the-colour-archive-mixes", JSON.stringify(mixes));
  }, sample.mixes);
  await page.reload();
});

test.afterAll(async () => {
  await context.close();
  expect(pageErrors, "no uncaught errors in the page").toEqual([]);
});

const titles = () => page.locator(".mix-card h3");
const card = (name: string) => page.locator(".mix-card", { has: page.getByRole("heading", { name, exact: true }) });

// ---------- Favourites, filters and sorting ----------

test("starring a mix moves it to the top and survives a reload", async () => {
  await page.getByRole("button", { name: "Add Gunmetal to favourites" }).click();
  await expect(page.getByText("“Gunmetal” added to favourites")).toBeVisible();
  await expect(titles().first()).toHaveText("Gunmetal");
  await page.reload();
  await expect(titles().first()).toHaveText("Gunmetal");
  await expect(page.getByRole("button", { name: "Remove Gunmetal from favourites" })).toHaveAttribute("aria-pressed", "true");
});

test("the favourites filter shows only starred mixes", async () => {
  await page.getByRole("button", { name: /Favourites/ }).click();
  await expect(titles()).toHaveText(["Gunmetal"]);
  await page.getByRole("button", { name: /Favourites/ }).click();
  await expect(titles()).toHaveCount(sample.mixes.length);
});

test("colour family chips filter by colour", async () => {
  const families = page.getByRole("group", { name: "Filter by colour family" });
  await families.getByRole("button", { name: /Blues/ }).click();
  await expect(titles()).toHaveText(["Deep ocean blue", "Ultramarine armour", "Icy edge highlight"]);
  await families.getByRole("button", { name: "All colours" }).click();
  await expect(titles()).toHaveCount(sample.mixes.length);
});

test("the paint filter shows the mixes that use a paint", async () => {
  await page.getByLabel("Filter by paint").selectOption({ label: "Nuln Oil · Citadel" });
  await expect(titles()).toHaveText(["Gunmetal", "Weathered bronze"]);
  await page.getByLabel("Search mixes").fill("bronze");
  await expect(titles()).toHaveText(["Weathered bronze"]);
  await page.getByLabel("Search mixes").fill("zzzz");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(titles()).toHaveCount(sample.mixes.length);
});

test("sorting by colour runs round the wheel, favourites still first", async () => {
  await page.getByLabel("Sort mixes").selectOption({ label: "By colour" });
  await expect(titles().nth(0)).toHaveText("Gunmetal");
  await expect(titles().nth(1)).toHaveText("Dragon scale red");
  await expect(titles().nth(2)).toHaveText("Ember glow");
  await page.getByLabel("Sort mixes").selectOption({ label: "Newest first" });
});

// ---------- Match a colour ----------

test("matching a colour ranks the closest mixes first", async () => {
  await page.getByRole("button", { name: /Match a colour/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Your closest mixes appear here")).toBeVisible();
  await dialog.getByLabel("Colour to match").fill("#2b4c8c");
  const results = dialog.getByRole("list", { name: "Closest mixes" }).getByRole("listitem");
  await expect(results).toHaveCount(6);
  await expect(results.first()).toContainText("Ultramarine armour");
  await expect(results.first()).toContainText("Near identical");
  await expect(results.nth(1)).toContainText("Deep ocean blue");
});

test("a reference photo can be sampled to match, and a result opens the mix", async () => {
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
  const canvas = dialog.locator(".color-sampler-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  // The right half of the photo is blue (30, 60, 200).
  await expect.poll(async () => near(await dialog.getByLabel("Colour to match").inputValue(), [30, 60, 200])).toBe(true);
  const first = dialog.getByRole("list", { name: "Closest mixes" }).getByRole("listitem").first();
  await expect(first).toContainText("Ultramarine armour");
  // The photo stays inside its frame, above the results, instead of spilling over them.
  const frame = (await dialog.locator(".color-sampler-frame").boundingBox())!;
  const photo = (await canvas.boundingBox())!;
  const results = (await dialog.getByRole("list", { name: "Closest mixes" }).boundingBox())!;
  expect(photo.y + photo.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  expect(frame.y + frame.height).toBeLessThanOrEqual(results.y);
  // Once the colour is picked, the photo can be put away; the match stays.
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await expect(canvas).toHaveCount(0);
  await expect(first).toContainText("Ultramarine armour");
  // A result opens the mix's details on top; closing them goes back to the matches.
  await first.getByRole("button").click();
  await expect(page.getByRole("heading", { name: /Ultramarine armour/, level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Edit colour mix/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: /Match a colour/ })).toBeVisible();
  await expect(first).toContainText("Ultramarine armour");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ---------- Mix details ----------

test("clicking a mix card opens its details, not the edit form", async () => {
  await card("Weathered bronze").locator(".paint-line").first().click();
  const details = page.getByRole("dialog", { name: /Weathered bronze/ });
  await expect(details).toBeVisible();
  await expect(details).toContainText("#6F5A32");
  await expect(details.locator(".paint-line")).toHaveCount(2);
  await expect(details).toContainText("Horn tips and armour trim.");
  await expect(page.getByRole("heading", { name: /Edit colour mix/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  // The card's own buttons still do their own thing.
  await page.getByRole("button", { name: "Edit Weathered bronze" }).click();
  await expect(page.getByRole("heading", { name: /Edit colour mix/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the summary shows the latest colours as blocks that open each mix, with no card numbers", async () => {
  const summary = page.getByRole("region", { name: "Archive summary" });
  await expect(summary).not.toContainText(/\b0[123]\b/);
  const newest = [...sample.mixes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const blocks = summary.locator(".palette-strip button");
  await expect(blocks).toHaveCount(6);
  await blocks.first().click();
  await expect(page.getByRole("dialog", { name: new RegExp(newest[0].name) })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the details open from the keyboard and return focus to the card", async () => {
  const open = card("Weathered bronze").getByRole("button", { name: "View Weathered bronze" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Weathered bronze/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
});

test("the details can star a mix and lead on to editing it", async () => {
  await card("Weathered bronze").getByRole("button", { name: "View Weathered bronze" }).click();
  const details = page.getByRole("dialog", { name: /Weathered bronze/ });
  await details.getByRole("button", { name: "Add to favourites" }).click();
  await expect(details.getByRole("button", { name: "Remove from favourites" })).toHaveAttribute("aria-pressed", "true");
  await expect(details).toContainText("A FAVOURITE MIX");
  await details.getByRole("button", { name: "Remove from favourites" }).click();
  await details.getByRole("button", { name: /Edit mix/ }).click();
  await expect(page.getByRole("heading", { name: /Edit colour mix/ })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Stormy midnight blue")).toHaveValue("Weathered bronze");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ---------- My paints and the shopping list ----------

test("My paints starts empty and offers the paints the mixes use", async () => {
  await page.getByRole("link", { name: "My paints" }).click();
  await expect(page).toHaveURL(/\/paints$/);
  await expect(page.getByText("Put your shelf on the list")).toBeVisible();
  const uniquePaints = new Set(sample.mixes.flatMap((mix) => mix.paints.map((paint) => `${paint.brand}|${paint.name}`))).size;
  await expect(page.getByRole("heading", { name: /In your mixes, not on your list/ })).toContainText(String(uniquePaints));
  // With nothing on the list yet, nothing counts as missing, so the shopping list stays empty.
  await expect(page.getByRole("link", { name: /Shopping list/ })).toContainText("0");
});

test("paints can be added from the mixes and by hand", async () => {
  await page.getByRole("button", { name: "I own Nuln Oil" }).click();
  await expect(page.getByText("Nuln Oil added to My paints")).toBeVisible();
  await page.getByRole("button", { name: /Add paint/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paint name").fill("Kraken Ink");
  await dialog.getByLabel("Brand").fill("The Army Painter");
  await dialog.getByLabel("Paint swatch colour").fill("#2f4a5f");
  await dialog.getByLabel("Wishlist").check();
  await dialog.getByRole("button", { name: "Add paint" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".paint-row", { hasText: "Kraken Ink" })).toBeVisible();
  // The same paint can't be added twice.
  await page.getByRole("button", { name: /Add paint/ }).first().click();
  await page.getByRole("dialog").getByLabel("Paint name").fill("kraken ink");
  await page.getByRole("dialog").getByLabel("Brand").fill("the army painter");
  await page.getByRole("dialog").getByRole("button", { name: "Add paint" }).click();
  await expect(page.getByRole("dialog").getByText("already on your list")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("changing a paint's status moves it onto the shopping list", async () => {
  await page.getByLabel("Status of Nuln Oil").selectOption({ label: "Running low" });
  await expect(page.getByText("Nuln Oil: running low")).toBeVisible();
  await page.getByRole("link", { name: /Shopping list/ }).click();
  await expect(page).toHaveURL(/\/paints\/shopping$/);
  const rows = page.locator(".shopping-rows .paint-row");
  await expect(rows.nth(0)).toContainText("Nuln Oil");
  await expect(rows.nth(0)).toContainText("Running low");
  await expect(rows.nth(1)).toContainText("Kraken Ink");
  await expect(rows.nth(1)).toContainText("Wishlist");
  // Now that My paints has something on it, paints the mixes need appear too.
  await expect(rows.nth(2)).toContainText("Not on your shelf");
  const count = await rows.count();
  await expect(page.locator(".shopping-count").first()).toHaveText(new RegExp(`^${count}`));
});

test("Bought takes a paint off the list and Copy list copies it as text", async () => {
  const before = await page.locator(".shopping-rows .paint-row").count();
  await page.getByRole("button", { name: "Bought Kraken Ink" }).click();
  await expect(page.locator(".shopping-rows .paint-row")).toHaveCount(before - 1);
  await page.getByRole("button", { name: "Copy list" }).click();
  // The system clipboard may turn line breaks into CR LF (Windows).
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(text.split("\n")[0]).toBe("Paint shopping list");
  expect(text).toContain("- Nuln Oil (Citadel) – running low");
  expect(text).not.toContain("Kraken Ink");
});

test("mix cards mark paints that aren't owned", async () => {
  await page.getByRole("link", { name: "Mixes" }).click();
  const gunmetal = card("Gunmetal");
  await expect(gunmetal.locator(".paint-line", { hasText: "Leadbelcher" }).locator(".missing-paint")).toBeVisible();
  await expect(gunmetal.locator(".paint-line", { hasText: "Nuln Oil" }).locator(".missing-paint")).toHaveCount(0);
});

test("choosing a paint from My paints in the mix form fills in its brand", async () => {
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paint brand").selectOption("Vallejo");
  await dialog.getByLabel("Paint name").fill("Kraken Ink");
  await expect(dialog.getByLabel("Paint brand")).toHaveValue("The Army Painter");
  expect(await dialog.locator("#owned-paint-names option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["Kraken Ink", "Nuln Oil"]);
  await page.keyboard.press("Escape");
});

// ---------- Recipes ----------

test("a recipe is built from mixes and single paints", async () => {
  await page.getByRole("link", { name: "Recipes" }).click();
  await expect(page.getByText("Write down your first scheme")).toBeVisible();
  await page.getByRole("button", { name: /New recipe/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Save recipe/ }).click();
  await expect(dialog.getByText("Give your recipe a name")).toBeVisible();
  await dialog.getByPlaceholder("e.g. Weathered bronze armour").fill("Blue power armour");
  await dialog.getByRole("button", { name: /Save recipe/ }).click();
  await expect(dialog.getByText("Add at least one step")).toBeVisible();

  await dialog.getByLabel("Step 1 colour").selectOption({ label: "Ultramarine armour" });
  await dialog.getByLabel("Step 2 paint name").fill("Nuln Oil");
  await dialog.getByLabel("Step 2 note").fill("Recesses only");
  await dialog.getByLabel("Step 3 colour").selectOption({ label: "Icy edge highlight" });
  await dialog.getByLabel("Step 3 technique").selectOption("Edge highlight");
  await dialog.getByRole("button", { name: /Save recipe/ }).click();
  await expect(dialog).toBeHidden();

  const recipe = page.locator(".recipe-card", { hasText: "Blue power armour" });
  // The fourth step had no colour, so it was left out.
  await expect(recipe.locator(".recipe-step")).toHaveCount(3);
  await expect(recipe.locator(".step-role")).toHaveText(["Base", "Shade", "Edge highlight"]);
  await expect(recipe.locator(".recipe-step").nth(1)).toContainText("Recesses only");
  await expect(recipe.locator(".recipe-step").nth(1).locator(".missing-paint")).toHaveCount(0);
});

test("steps can be reordered, and the recipe search finds paints", async () => {
  await page.getByRole("button", { name: "Edit Blue power armour" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Move step 2 up" }).click();
  await dialog.getByRole("button", { name: /Save changes/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".recipe-card .step-role")).toHaveText(["Shade", "Base", "Edge highlight"]);
  await page.getByLabel("Search recipes").fill("icy edge");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.getByLabel("Search recipes").fill("nothing like this");
  await expect(page.getByText("No recipes found")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).first().click();
});

test("a recipe step's mix opens its details, which list where it's used", async () => {
  await page.locator(".recipe-card").getByRole("button", { name: "Ultramarine armour" }).click();
  const details = page.getByRole("dialog", { name: /Ultramarine armour/ });
  await expect(details.getByRole("list").last()).toContainText("Blue power armour");
  await page.keyboard.press("Escape");
});

// ---------- Projects ----------

test("a project links recipes and mixes and keeps progress photos", async () => {
  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByRole("button", { name: /New project/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Ultramarines strike force").fill("Blue company");
  await dialog.getByRole("checkbox", { name: /Blue power armour/ }).check();
  await dialog.getByRole("checkbox", { name: /Gunmetal/ }).check();
  await dialog.getByRole("button", { name: /Create project/ }).click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
  await expect(page.locator("h1")).toContainText("Blue company");
  await expect(page.locator(".breadcrumb strong")).toHaveText("Blue company");
  await expect(page.locator(".recipe-card")).toContainText("Blue power armour");
  await expect(page.locator(".mix-chips")).toContainText("Gunmetal");
  await page.getByRole("button", { name: "View Gunmetal" }).click();
  await expect(page.getByRole("dialog", { name: /Gunmetal/ }).getByRole("link", { name: /Blue company/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator('.project-section input[type="file"]').setInputFiles(TWO_TONE);
  const photo = page.getByRole("dialog");
  await photo.getByLabel("Caption").fill("Base coats done");
  await photo.getByRole("button", { name: /Save photo/ }).click();
  await expect(photo).toBeHidden();
  await expect(page.locator(".progress-photo")).toHaveCount(1);
  await expect(page.locator(".progress-photo figcaption")).toContainText("Base coats done");

  await page.getByRole("button", { name: "View photo: Base coats done" }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "Base coats done" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the project card shows its photo, and editing keeps the photos", async () => {
  await page.getByRole("button", { name: /Edit project/ }).click();
  await page.getByRole("dialog").getByPlaceholder("e.g. Ultramarines strike force").fill("Blue company, 2nd squad");
  await page.getByRole("dialog").getByRole("button", { name: /Save project/ }).click();
  await expect(page.locator("h1")).toContainText("2nd squad");
  await expect(page.locator(".progress-photo")).toHaveCount(1);
  await page.getByRole("link", { name: "All projects" }).click();
  const projectCard = page.locator(".project-card", { hasText: "2nd squad" });
  await expect(projectCard.locator("img")).toBeVisible();
  await expect(projectCard).toContainText("1 recipe · 1 mix");
});

test("a backup includes recipes, projects with photos, and paints", async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(data.version).toBe(2);
  expect(data.recipes).toHaveLength(1);
  expect(data.projects[0].photos[0]).toMatchObject({ caption: "Base coats done", image: expect.stringMatching(/^data:image\/jpeg;base64,/) });
  expect(data.paints.map((paint: { name: string }) => paint.name).sort()).toEqual(["Kraken Ink", "Nuln Oil"]);
  expect(data.mixes.find((mix: { name: string }) => mix.name === "Gunmetal").favorite).toBe(true);
});

test("deleting a photo and then the project asks first", async () => {
  await page.locator(".project-card", { hasText: "2nd squad" }).click();
  await page.getByRole("button", { name: "Remove photo Base coats done" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
  await expect(page.locator(".progress-photo")).toHaveCount(0);
  await page.getByRole("button", { name: /Delete/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText("Start your first project")).toBeVisible();
});

test("deleting a mix used by a recipe leaves a marked gap", async () => {
  await page.getByRole("link", { name: "Mixes" }).click();
  await card("Icy edge highlight").getByRole("button", { name: "Delete Icy edge highlight" }).click();
  await page.getByRole("button", { name: "Remove mix" }).click();
  await page.getByRole("link", { name: "Recipes" }).click();
  await expect(page.locator(".recipe-step").nth(2)).toContainText("A mix that was deleted");
});

// ---------- Select mode ----------

test("several mixes can be selected and deleted together, after one confirmation", async () => {
  await page.getByRole("link", { name: "Mixes" }).click();
  // Counted from storage, not the screen, so the count can't be taken before the cards appear.
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("the-colour-archive-mixes") || "[]").length as number);
  await expect(titles()).toHaveCount(before);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  // In select mode, a click on the card picks it instead of opening its details.
  await card("Old parchment").locator(".paint-line").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select Dead grass tufts" }).check();
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText("2 mixes selected");
  // The card's own buttons are hidden while selecting.
  await expect(page.getByRole("button", { name: "Delete Old parchment" })).toHaveCount(0);

  await bar.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete 2 mixes?" });
  await expect(confirm).toContainText("Old parchment");
  await confirm.getByRole("button", { name: "Delete 2 mixes" }).click();
  await expect(page.getByText("2 mixes removed from your archive.")).toBeVisible();
  await expect(titles()).toHaveCount(before - 2);
  await expect(bar).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("the-colour-archive-mixes") || "[]").map((mix: { name: string }) => mix.name));
  expect(saved).not.toContain("Old parchment");
  expect(saved).not.toContain("Dead grass tufts");
});

test("Select all only picks what the filters show, and Escape leaves select mode", async () => {
  await page.getByRole("group", { name: "Filter by colour family" }).getByRole("button", { name: /Blues/ }).click();
  const shown = await titles().count();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const bar = page.getByRole("region", { name: "Selection" });
  await bar.getByRole("button", { name: `Select all ${shown}` }).click();
  await expect(bar).toContainText(`${shown} mixes selected`);
  await expect(bar.getByRole("button", { name: "Select none" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit Ultramarine armour/ })).toBeVisible();
  await page.getByRole("group", { name: "Filter by colour family" }).getByRole("button", { name: "All colours" }).click();
});

test("several paints can be removed from My paints together", async () => {
  await page.getByRole("link", { name: "My paints" }).click();
  for (const name of ["Greenskin", "Flat Earth"]) await page.getByRole("button", { name: `I own ${name}` }).click();
  await expect(page.locator(".paint-groups .paint-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  // A click anywhere on a row picks it.
  await page.locator(".paint-groups .paint-row", { hasText: "Greenskin" }).click();
  await page.getByRole("checkbox", { name: "Select Flat Earth" }).check();
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText("2 paints selected");
  await bar.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove 2 paints" }).click();
  await expect(page.getByText("2 paints removed from My paints.")).toBeVisible();
  await expect(page.locator(".paint-groups .paint-row")).toHaveCount(2);
  await expect(page.locator(".paint-groups")).not.toContainText("Greenskin");
});

test("the My paints tabs have no scrollbar", async () => {
  const tabs = page.getByRole("navigation", { name: "Paints" });
  expect(await tabs.evaluate((element) => getComputedStyle(element).overflowX)).toBe("visible");
});

// ---------- Theme ----------

test("the theme switch cycles device, light and dark, and dark survives a reload", async () => {
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "system");
  const button = page.getByRole("button", { name: /^Theme:/ });
  expect(await theme()).toBe("system");
  await button.click();
  expect(await theme()).toBe("light");
  await button.click();
  expect(await theme()).toBe("dark");
  await page.reload();
  expect(await theme()).toBe("dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(21, 26, 24)");
  await button.click();
  expect(await theme()).toBe("system");
  expect(await page.evaluate(() => localStorage.getItem("the-colour-archive-theme"))).toBeNull();
});

test("dark mode also follows the device setting", async ({ browser, baseURL }) => {
  const dark = await browser.newContext({ baseURL, colorScheme: "dark" });
  const darkPage = await dark.newPage();
  await darkPage.goto("/");
  expect(await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(21, 26, 24)");
  await dark.close();
});

// ---------- Phones ----------

test("on a phone, the bottom tabs reach every page without sideways scrolling", async () => {
  await page.setViewportSize({ width: 360, height: 760 });
  const tabs = page.getByRole("navigation", { name: "Workshop" });
  for (const [name, url] of [["Collections", /\/collections$/], ["Recipes", /\/recipes$/], ["Projects", /\/projects$/], ["My paints", /\/paints$/], ["Mixes", /\/$/]] as const) {
    await tabs.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    // Polled, because the page slides over for 0.28 s when the window narrows and the sidebar hides.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: name }).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});
