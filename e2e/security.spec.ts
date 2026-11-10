import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { disableShareSheet, tempFile, TWO_TONE } from "./support";

// Runs against the production build (vite preview), with the security headers from netlify.toml
// added to every response exactly as Netlify sends them.

function netlifyHeaders(): Record<string, string> {
  const toml = fs.readFileSync(path.join(import.meta.dirname, "..", "netlify.toml"), "utf8");
  // The first [[headers]] block is the one for every page ("/*"); later blocks cover single paths.
  const start = toml.indexOf("[headers.values]");
  const end = toml.indexOf("[[", start);
  const block = toml.slice(start, end === -1 ? undefined : end);
  return Object.fromEntries([...block.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)].map((match) => [match[1], match[2]]));
}
const HEADERS = netlifyHeaders();

const XSS = [
  `<img src=x onerror="window.__xss='img'">`,
  `"><svg onload="window.__xss='svg'">`,
  `<script>window.__xss='script'</script>`,
  `javascript:window.__xss='js'`,
];
const evilMix = (i = 0) => ({
  name: XSS[i % 4], color: "#123456", notes: XSS[(i + 1) % 4], image: "",
  paints: [{ name: XSS[(i + 2) % 4], brand: XSS[(i + 3) % 4], drops: `2<img src=x onerror="window.__xss='drops'">`, swatch: "red;background:url(https://evil.example/x)" }],
});
const shareUrl = (payload: unknown) => `/#share=${encodeURIComponent(JSON.stringify(payload))}`;

let context: BrowserContext;
test.beforeEach(async ({ browser, baseURL }) => {
  // Requests a service worker makes can't be routed, so it's blocked here to keep the headers on
  // every response. The offline tests at the end run with it allowed.
  context = await browser.newContext({ baseURL, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], serviceWorkers: "block" });
  await context.route(`${baseURL}/**`, async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), ...HEADERS } });
    } catch (error) {
      // The page navigated away while this request was in flight (e.g. the manifest or an icon),
      // so the browser no longer wants it. Anything else is a real failure.
      if (!/disposed|closed|Target page/i.test(String(error))) throw error;
    }
  });
  await context.addInitScript(() => {
    (window as unknown as { __violations: string[] }).__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => (window as unknown as { __violations: string[] }).__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await disableShareSheet(context);
});
test.afterEach(async () => { await context.close(); });

async function open(url = "/") {
  const page = await context.newPage();
  page.on("dialog", (dialog) => { throw new Error(`Unexpected dialog: ${dialog.message()}`); });
  await page.goto(url);
  return page;
}

/** Did anything run or get injected, was Object.prototype polluted, did the CSP block anything? */
const inspect = (page: Page) => page.evaluate(() => ({
  xss: (window as unknown as { __xss?: string }).__xss,
  injectedNodes: document.querySelectorAll('img[src="x"], svg[onload], body script:not([src])').length,
  polluted: (({}) as Record<string, unknown>).polluted,
  violations: (window as unknown as { __violations: string[] }).__violations,
}));

test("the page is served with all the security headers", async () => {
  const page = await context.newPage();
  const response = await page.goto("/");
  const headers = response!.headers();
  for (const name of ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    expect(headers[name], name).toBeTruthy();
  }
});

test("the app loads under the CSP with its fonts and no violations", async () => {
  const page = await open();
  await page.evaluate(() => document.fonts.ready);
  // Browsers only download the weights a page uses, so check each family has a loaded face.
  expect(await page.evaluate(() => ["Barlow", "Barlow Condensed", "Space Mono"].map((font) => [...document.fonts].some((face) => face.family.replace(/"/g, "") === font && face.status === "loaded")))).toEqual([true, true, true]);
  expect((await inspect(page)).violations).toEqual([]);
});

test("script in a shared mix shows as text and never runs, even after saving", async () => {
  const page = await open(shareUrl({ version: 1, kind: "mix", mix: evilMix(0) }));
  await expect(page.getByText("A COLOUR MIX TO TRY")).toBeVisible();
  await expect(page.locator("h1")).toContainText("<img src=x");
  expect(await inspect(page)).toMatchObject({ xss: undefined, injectedNodes: 0 });
  await page.getByRole("button", { name: /Save mix to my archive/ }).click();
  await page.goto("/");
  await expect(page.locator(".mix-card")).toHaveCount(1);
  expect(await inspect(page)).toMatchObject({ xss: undefined, injectedNodes: 0 });
});

test("script in a shared collection shows as text and never runs", async () => {
  const page = await open(shareUrl({ version: 1, kind: "collection", name: XSS[1], mixes: [evilMix(1), evilMix(2)] }));
  await expect(page.getByText("A COLLECTION TO EXPLORE")).toBeVisible();
  expect(await inspect(page)).toMatchObject({ xss: undefined, injectedNodes: 0 });
});

for (const [label, mix] of [
  ["a javascript: photo", { ...evilMix(), image: "javascript:window.__xss='photo'" }],
  ["a remote photo", { ...evilMix(), image: "https://evil.example/track.png" }],
  ["an SVG photo with script", { ...evilMix(), image: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" }],
  ["CSS injection in the colour", { ...evilMix(), color: "red;background:url(https://evil.example)" }],
] as const) {
  test(`a shared link with ${label} is rejected`, async () => {
    const page = await open(shareUrl({ version: 1, kind: "mix", mix }));
    await expect(page.getByText("This share link is unavailable")).toBeVisible();
    expect((await inspect(page)).xss).toBeUndefined();
  });
}

test("malformed, oversized and prototype-polluting links fail safely", async () => {
  for (const hash of ["#share=%7B%22version%22%3A1", `#share=${"A".repeat(200000)}`, "#share=%7B%22__proto__%22%3A%7B%22polluted%22%3Atrue%7D%7D", "#s=not*base64"]) {
    const page = await open(`/${hash}`);
    await expect(page.getByText("This share link is unavailable")).toBeVisible();
    expect(await inspect(page)).toMatchObject({ xss: undefined, polluted: undefined });
    await page.close();
  }
});

test("a backup full of script and __proto__ keys imports as plain data", async () => {
  const mixes = [0, 1, 2, 3].map((i) => ({ ...evilMix(i), id: `00000000-0000-4000-8000-00000000000${i}`, createdAt: "2026-11-01T10:00:00.000Z" }));
  const file = tempFile("evil-backup.json", JSON.stringify({ app: "the-colour-archive", version: 1, mixes, collections: [{ id: "c-evil", name: XSS[0], mixIds: mixes.map((mix) => mix.id) }] })
    .replace('"mixes":[{', '"__proto__":{"polluted":true},"mixes":[{"__proto__":{"polluted":true},'));
  const page = await open();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
  await page.getByRole("button", { name: "Add to archive" }).click();
  await expect(page.getByText("Imported 4 mixes")).toBeVisible();
  await page.locator(".collection-nav-item").first().click();
  expect(await inspect(page)).toMatchObject({ xss: undefined, injectedNodes: 0, polluted: undefined });
});

test("script in recipes, projects and paints from a backup shows as text and never runs", async () => {
  const date = "2026-11-01T10:00:00.000Z";
  const mix = { ...evilMix(0), id: "00000000-0000-4000-8000-000000000010", createdAt: date };
  const file = tempFile("evil-workshop.json", JSON.stringify({
    app: "the-colour-archive",
    version: 2,
    mixes: [mix],
    collections: [],
    recipes: [{ id: "r-evil", name: XSS[1], notes: XSS[2], createdAt: date, steps: [
      { role: XSS[3], mixId: mix.id, paint: "", note: XSS[0] },
      { role: "Base", mixId: null, paint: XSS[2], note: "" },
    ] }],
    projects: [{ id: "p-evil", name: XSS[0], notes: XSS[1], createdAt: date, recipeIds: ["r-evil"], mixIds: [mix.id], photos: [] }],
    paints: [{ id: "pa-evil", name: XSS[3], brand: XSS[0], swatch: "#123456", status: "low", createdAt: date }],
  }));
  const page = await open();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
  await page.getByRole("button", { name: "Add to archive" }).click();
  await expect(page.getByText("Imported 1 mix")).toBeVisible();
  for (const path of ["/recipes", "/projects", "/projects/p-evil", "/paints", "/paints/shopping"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await inspect(page), path).toMatchObject({ xss: undefined, injectedNodes: 0, violations: [] });
  }
  await expect(page.getByText(XSS[3]).first()).toBeVisible();
});

test("a file over 50 MB is refused before it is read", async () => {
  const file = tempFile("huge.json", Buffer.alloc(51 * 1024 * 1024, 32));
  const page = await open();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
  await expect(page.getByText("too large to be a Colour Archive backup")).toBeVisible();
  fs.unlinkSync(file);
});

test("normal use causes no CSP violations: photo, export, share link, sign-in", async () => {
  const page = await open();
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill("CSP check");
  await dialog.getByLabel("Paint name").fill("Red");
  await dialog.locator('input[type="file"]').setInputFiles(TWO_TONE);
  const canvas = dialog.locator(".color-sampler-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20);
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(page.getByText("Mix saved")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole("button", { name: "Share CSP check" }).click();
  await expect(page.locator("#share-link")).toBeVisible();
  const packed = await page.locator("#share-link").inputValue();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  if (await page.getByRole("button", { name: "Sign in to sync your archive" }).count()) {
    await page.getByRole("button", { name: "Sign in to sync your archive" }).click();
    await page.keyboard.press("Escape");
  }
  expect((await inspect(page)).violations).toEqual([]);

  const viewer = await open(new URL(packed).hash ? `/${new URL(packed).hash}` : packed);
  await expect(viewer.getByText("A COLOUR MIX TO TRY")).toBeVisible();
  expect((await inspect(viewer)).violations).toEqual([]);
});

test("another site can't show the app in a frame", async ({ baseURL }) => {
  const page = await context.newPage();
  await page.setContent(`<iframe src="${baseURL}/" style="width:400px;height:300px"></iframe>`);
  await page.waitForTimeout(1500);
  const frame = page.frames().find((candidate) => candidate.url().startsWith(baseURL!));
  const rendered = frame ? await frame.evaluate(() => Boolean(document.querySelector(".app-shell"))).catch(() => false) : false;
  expect(rendered).toBe(false);
});

// ---------- Installable app ----------

test("the web app manifest and its icons are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "The Colour Archive", start_url: "/", display: "standalone" });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()["content-type"], icon.src).toContain(icon.type);
  }
  const page = await open();
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");
});

test("once installed, the app opens offline with the archive saved in the browser", async ({ browser, baseURL }) => {
  const offline = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  try {
    const page = await offline.newPage();
    await page.goto("/");
    // Wait until the service worker controls the page, then save a mix to this browser.
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(() => localStorage.setItem("the-colour-archive-mixes", JSON.stringify([{
      id: "offline-mix", createdAt: "2026-11-01T10:00:00.000Z", name: "Offline ochre", color: "#b5852f", notes: "", image: "",
      paints: [{ name: "Ochre", brand: "Vallejo", drops: "2", swatch: "#b5852f" }],
    }])));

    await offline.setOffline(true);
    await page.reload();
    await expect(page.locator(".mix-card h3")).toHaveText("Offline ochre");
    // Other pages open offline too: every route is the same app.
    await page.goto("/recipes");
    await expect(page.locator("h1")).toContainText("Recipes");
  } finally {
    await offline.close();
  }
});
