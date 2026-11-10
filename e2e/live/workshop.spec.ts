import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AUTH_STORAGE_KEY, authHeaders, cleanUpLiveUser, signUpAnonymously, SUPABASE_URL, TWO_TONE, type LiveUser } from "../support";

// Recipes, projects, My paints and favourites against the real Supabase project: the app saving
// them to an account, and row-level security keeping each account's rows to itself.
// Needs the "Workshop" part of supabase/schema.sql to have been run.
test.describe.configure({ mode: "serial" });

let a: LiveUser;
let b: LiveUser;
let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

async function call(path: string, init: RequestInit & { as?: LiveUser } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...authHeaders(init.as), Prefer: "return=representation", ...(init.headers as Record<string, string> || {}) } });
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, body };
}
const rows = (body: unknown) => (Array.isArray(body) ? body as Record<string, unknown>[] : []);

test.beforeAll(async ({ browser, baseURL }) => {
  a = await signUpAnonymously();
  b = await signUpAnonymously();
  const probe = await call("/rest/v1/recipes?select=id", { as: a });
  test.skip(probe.status === 404, "Run the Workshop section of supabase/schema.sql in Supabase first.");
  context = await browser.newContext({ baseURL });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.evaluate(([key, session]) => { localStorage.clear(); localStorage.setItem(key, session); }, [AUTH_STORAGE_KEY, a.session] as const);
  await page.reload();
  await expect(page.getByText("Synced to your account")).toBeVisible();
});

test.afterAll(async () => {
  await cleanUpLiveUser(a);
  await cleanUpLiveUser(b);
  await context?.close();
  expect(pageErrors).toEqual([]);
});

test("a mix can be starred, and the star is saved to the account", async () => {
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill("Live bronze");
  await dialog.getByLabel("Paint name").fill("Balthasar Gold");
  await dialog.getByLabel("Paint brand").selectOption("Citadel");
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Add Live bronze to favourites" }).click();
  await expect(page.getByText("added to favourites")).toBeVisible();
  expect(rows((await call("/rest/v1/mixes?select=favorite", { as: a })).body)).toEqual([{ favorite: true }]);
});

test("paints, recipes and projects save to the account and load again", async () => {
  await page.goto("/paints");
  await page.getByRole("button", { name: "I own Balthasar Gold" }).click();
  await expect(page.locator(".paint-row", { hasText: "Balthasar Gold" })).toBeVisible();
  await page.getByLabel("Status of Balthasar Gold").selectOption({ label: "Running low" });
  await expect(page.getByText("Balthasar Gold: running low.")).toBeVisible();

  await page.goto("/recipes");
  await page.getByRole("button", { name: /New recipe/ }).first().click();
  const recipe = page.getByRole("dialog");
  await recipe.getByPlaceholder("e.g. Weathered bronze armour").fill("Live armour");
  await recipe.getByLabel("Step 1 colour").selectOption({ label: "Live bronze" });
  await recipe.getByLabel("Step 2 paint name").fill("Nuln Oil");
  await recipe.getByRole("button", { name: /Save recipe/ }).click();
  await expect(recipe).toBeHidden();

  await page.goto("/projects");
  await page.getByRole("button", { name: /New project/ }).first().click();
  const project = page.getByRole("dialog");
  await project.getByPlaceholder("e.g. Ultramarines strike force").fill("Live project");
  await project.getByRole("checkbox", { name: /Live armour/ }).check();
  await project.getByRole("button", { name: /Create project/ }).click();
  await expect(page.locator("h1")).toContainText("Live project");
  await page.locator('.project-section input[type="file"]').setInputFiles(TWO_TONE);
  await page.getByRole("dialog").getByLabel("Caption").fill("Primed");
  await page.getByRole("dialog").getByRole("button", { name: /Save photo/ }).click();
  await expect(page.locator(".progress-photo img")).toBeVisible();

  const [paintRow] = rows((await call("/rest/v1/paints?select=name,status", { as: a })).body);
  expect(paintRow).toEqual({ name: "Balthasar Gold", status: "low" });
  const [recipeRow] = rows((await call("/rest/v1/recipes?select=name,steps", { as: a })).body);
  expect(recipeRow.name).toBe("Live armour");
  expect((recipeRow.steps as { paint: string }[]).map((step) => step.paint)).toEqual(["", "Nuln Oil"]);
  const [projectRow] = rows((await call("/rest/v1/projects?select=name,photos", { as: a })).body);
  expect((projectRow.photos as { path: string; caption: string }[])[0]).toMatchObject({ caption: "Primed", path: expect.stringMatching(new RegExp(`^${a.id}/project-`)) });

  await page.reload();
  await expect(page.locator(".progress-photo img")).toBeVisible();
  await expect(page.locator(".recipe-card")).toContainText("Live armour");
});

test("removing a project photo deletes the file too", async () => {
  await page.getByRole("button", { name: "Remove photo Primed" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
  await expect(page.locator(".progress-photo")).toHaveCount(0);
  const files = (await (await fetch(`${SUPABASE_URL}/storage/v1/object/list/mix-photos`, { method: "POST", headers: authHeaders(a), body: JSON.stringify({ prefix: a.id, limit: 100 }) })).json()) as { name: string }[];
  expect(files.filter((file) => file.name.startsWith("project-"))).toEqual([]);
});

test("a visitor with only the public key can't read or add paints, recipes or projects", async () => {
  for (const table of ["paints", "recipes", "projects"]) {
    expect((await call(`/rest/v1/${table}?select=*`)).status, `read ${table}`).toBeGreaterThanOrEqual(400);
    expect((await call(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify({ name: "x", swatch: "#000000" }) })).status, `insert ${table}`).toBeGreaterThanOrEqual(400);
  }
});

test("user B can't see, change or delete user A's paints, recipes or projects", async () => {
  for (const table of ["paints", "recipes", "projects"]) {
    const [own] = rows((await call(`/rest/v1/${table}?select=id`, { as: a })).body);
    expect(own?.id, `${table} exists for A`).toBeTruthy();
    expect(rows((await call(`/rest/v1/${table}?select=id`, { as: b })).body), `B reads ${table}`).toEqual([]);
    expect(rows((await call(`/rest/v1/${table}?id=eq.${own.id}`, { as: b, method: "PATCH", body: JSON.stringify({ name: "taken" }) })).body), `B edits ${table}`).toEqual([]);
    expect(rows((await call(`/rest/v1/${table}?id=eq.${own.id}`, { as: b, method: "DELETE" })).body), `B deletes ${table}`).toEqual([]);
    // Inserting a row in A's name is refused.
    const forged = { paints: { name: "Forged", swatch: "#000000" }, recipes: { name: "Forged" }, projects: { name: "Forged" } }[table];
    expect((await call(`/rest/v1/${table}`, { as: b, method: "POST", body: JSON.stringify({ ...forged, user_id: a.id }) })).status, `B forges ${table}`).toBeGreaterThanOrEqual(400);
  }
  expect(rows((await call("/rest/v1/paints?select=name", { as: a })).body)).toEqual([{ name: "Balthasar Gold" }]);
});

test("the database refuses bad values, duplicate paints and photos from another folder", async () => {
  expect((await call("/rest/v1/paints", { as: b, method: "POST", body: JSON.stringify({ name: "Bad", swatch: "#000000", status: "stolen" }) })).status).toBe(400);
  expect((await call("/rest/v1/paints", { as: b, method: "POST", body: JSON.stringify({ name: "Bad", swatch: "red" }) })).status).toBe(400);
  expect((await call("/rest/v1/paints", { as: b, method: "POST", body: JSON.stringify({ name: "Kraken Ink", brand: "TAP", swatch: "#000000" }) })).status).toBe(201);
  const duplicate = await call("/rest/v1/paints", { as: b, method: "POST", body: JSON.stringify({ name: " kraken ink ", brand: "tap", swatch: "#111111" }) });
  expect(duplicate.status).toBe(409);
  expect((await call("/rest/v1/recipes", { as: b, method: "POST", body: JSON.stringify({ name: "Big", steps: Array.from({ length: 31 }, () => ({ role: "Base", mixId: null, paint: "x", note: "" })) }) })).status).toBe(400);
  // A project can't point at a photo in someone else's folder.
  const stolen = await call("/rest/v1/projects", { as: b, method: "POST", body: JSON.stringify({ name: "Stolen photo", photos: [{ id: "x", path: `${a.id}/project-x.jpg`, caption: "", added_at: new Date().toISOString() }] }) });
  expect(stolen.status).toBe(400);
});

test("selecting several mixes and paints deletes them from the account, photos included", async () => {
  // Three mixes with a photo each, made through the app so their photos are real stored files.
  await page.goto("/");
  for (const name of ["Bulk one", "Bulk two", "Bulk keep"]) {
    await page.getByRole("button", { name: /New colour mix/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill(name);
    await dialog.getByLabel("Paint name").fill(`${name} paint`);
    await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
    await expect(dialog.locator(".color-sampler-canvas")).toBeVisible();
    await dialog.getByRole("button", { name: /Save mix/ }).click();
    await expect(dialog).toBeHidden();
  }
  const photoFiles = async () => ((await (await fetch(`${SUPABASE_URL}/storage/v1/object/list/mix-photos`, { method: "POST", headers: authHeaders(a), body: JSON.stringify({ prefix: a.id, limit: 100 }) })).json()) as { name: string }[])
    .filter((file) => !file.name.startsWith("project-")).length;
  const photosBefore = await photoFiles();

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Bulk one" }).check();
  await page.getByRole("checkbox", { name: "Select Bulk two" }).check();
  await page.getByRole("region", { name: "Selection" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete 2 mixes" }).click();
  await expect(page.getByText("2 mixes removed from your archive.")).toBeVisible();

  const names = rows((await call("/rest/v1/mixes?select=name", { as: a })).body).map((row) => row.name);
  expect(names).toContain("Bulk keep");
  expect(names).not.toContain("Bulk one");
  expect(names).not.toContain("Bulk two");
  expect(await photoFiles()).toBe(photosBefore - 2);

  // Paints: add two from the mixes, then remove both at once.
  await page.goto("/paints");
  for (const name of ["Bulk keep paint", "Live bronze"]) {
    const add = page.getByRole("button", { name: `I own ${name}` });
    if (await add.count()) await add.click();
  }
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("region", { name: "Selection" }).getByRole("button", { name: /Select all/ }).click();
  const count = Number((await page.locator(".selection-count strong").innerText()).trim());
  await page.getByRole("region", { name: "Selection" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Remove \d+ paints?$/ }).click();
  await expect(page.getByText(`${count} ${count === 1 ? "paint" : "paints"} removed from My paints.`)).toBeVisible();
  expect(rows((await call("/rest/v1/paints?select=id", { as: a })).body)).toEqual([]);
});
