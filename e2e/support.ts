import { expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

/** The same Supabase settings the app uses: environment variables first, then .env.local. */
function readEnv(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  try {
    const line = fs.readFileSync(path.join(import.meta.dirname, "..", ".env.local"), "utf8").split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}
export const SUPABASE_URL = readEnv("VITE_SUPABASE_URL");
export const SUPABASE_KEY = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const AUTH_STORAGE_KEY = HAS_SUPABASE ? `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token` : "";

interface SampleMix { id: string; name: string; color: string; notes: string; image: string; createdAt: string; paints: { name: string; brand: string; drops: string; swatch: string }[] }
interface SampleCollection { id: string; name: string; mixIds: string[]; createdAt?: string }
export const sample: { mixes: SampleMix[]; collections: SampleCollection[] } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "sample-archive.json"), "utf8"));
export const SAMPLE_PATH = path.join(import.meta.dirname, "..", "sample-archive.json");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "colour-archive-e2e-"));
export const tempFile = (name: string, contents: string | Buffer) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, contents);
  return file;
};

/** A PNG whose pixels come from `pixel(x, y)`, written without any image library. */
export function makePng(name: string, width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = pixel(x, y); const offset = y * (width * 3 + 1) + 1 + x * 3;
    raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b;
  }
  return tempFile(name, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

/** Left half red, right half blue: sampling either side proves the picker reads real pixels. */
export const TWO_TONE = makePng("two-tone.png", 400, 200, (x) => (x < 200 ? [220, 30, 30] : [30, 60, 200]));

export const near = (hex: string, rgb: [number, number, number], tolerance = 24) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).every((channel, i) => Math.abs(channel - rgb[i]) <= tolerance);

export const stored = (page: Page) => page.evaluate(() => ({
  mixes: JSON.parse(localStorage.getItem("the-colour-archive-mixes") || "[]") as { id: string; name: string; image: string; color: string; createdAt: string }[],
  collections: JSON.parse(localStorage.getItem("the-colour-archive-collections") || "[]") as { id: string; name: string; mixIds: string[] }[],
}));

/** Headless Chrome's share sheet never resolves, so tests use the Copy path. */
export async function disableShareSheet(context: BrowserContext) {
  await context.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }); } catch { /* not supported */ }
  });
}

export async function addMix(page: Page, { name, paints = [["Red", "Citadel", "2"]], notes = "" }: { name: string; paints?: [string, string, string][]; notes?: string }) {
  await page.getByRole("button", { name: /New colour mix/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Stormy midnight blue").fill(name);
  for (const [index, [paintName, brand, drops]] of paints.entries()) {
    if (index > 0) await dialog.getByRole("button", { name: /Add another paint/ }).click();
    await dialog.getByLabel("Paint name").nth(index).fill(paintName);
    await dialog.getByLabel("Paint brand").nth(index).selectOption(brand);
    await dialog.getByLabel("Number of drops").nth(index).fill(drops);
  }
  if (notes) await dialog.getByPlaceholder(/What did you use it for/).fill(notes);
  await dialog.getByRole("button", { name: /Save mix/ }).click();
  await expect(dialog).toBeHidden();
}

/** Opens the share dialog, waits for the link, copies it, closes the dialog and returns the link. */
export async function shareFromDialog(page: Page, trigger: ReturnType<Page["getByRole"]>) {
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const field = dialog.locator("#share-link");
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /Copied/ }).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  return url;
}

// ---------- A signed-in account without a real one: a stand-in session plus mocked Supabase ----------

export const mockUser = {
  id: "11111111-2222-4333-8444-555555555555", aud: "authenticated", role: "authenticated", email: "giannis@example.com",
  created_at: "2026-10-02T09:00:00Z", last_sign_in_at: "2026-11-09T08:30:00Z",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} as Record<string, unknown>, identities: [],
};

export async function mockSignedIn(context: BrowserContext) {
  const user = structuredClone(mockUser);
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, exp: expiresAt, role: "authenticated", email: user.email })}.c2ln`;
  const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, refresh_token: "test-refresh", user });
  await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [AUTH_STORAGE_KEY, session]);

  const updates: Record<string, unknown>[] = [];
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.route(`${SUPABASE_URL}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === "/rest/v1/mixes") return route.fulfill(json(sample.mixes.map((mix) => ({ id: mix.id, user_id: user.id, name: mix.name, color: mix.color, notes: mix.notes, paints: mix.paints, image_path: null, created_at: mix.createdAt }))));
    if (pathname === "/rest/v1/collections") return route.fulfill(json(sample.collections.map((collection) => ({ id: collection.id, user_id: user.id, name: collection.name, created_at: collection.createdAt }))));
    if (pathname === "/rest/v1/collection_mixes") return route.fulfill(json(sample.collections.flatMap((collection) => collection.mixIds.map((id) => ({ collection_id: collection.id, mix_id: id, added_at: collection.createdAt })))));
    if (pathname === "/auth/v1/user" && method === "PUT") {
      const body = route.request().postDataJSON() as { data?: Record<string, unknown> };
      updates.push(body);
      user.user_metadata = { ...user.user_metadata, ...(body.data || {}) };
      return route.fulfill(json(user));
    }
    if (pathname === "/auth/v1/user") return route.fulfill(json(user));
    if (pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });
    return route.fulfill(json({}));
  });
  return { user, updates };
}

// ---------- Real accounts for the live tests (needs anonymous sign-in switched on) ----------

export interface LiveUser { id: string; token: string; session: string }

export async function signUpAnonymously(): Promise<LiveUser> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}" });
  const data = await response.json() as { access_token?: string; refresh_token: string; expires_in: number; expires_at: number; user: { id: string }; msg?: string };
  if (!data.access_token) throw new Error(`Anonymous sign-in failed (turn it on in Supabase → Authentication → Sign In / Providers): ${data.msg || response.status}`);
  return {
    id: data.user.id,
    token: data.access_token,
    session: JSON.stringify({ access_token: data.access_token, token_type: "bearer", expires_in: data.expires_in, expires_at: data.expires_at, refresh_token: data.refresh_token, user: data.user }),
  };
}

export const authHeaders = (user?: LiveUser) => ({
  apikey: SUPABASE_KEY,
  "Content-Type": "application/json",
  ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
});

/** Deletes everything a test user created: shares and their photos, mix photos, collections, mixes. */
export async function cleanUpLiveUser(user: LiveUser | undefined) {
  if (!user) return; // setup never got as far as creating the account
  const headers = authHeaders(user);
  const rest = (pathAndQuery: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { ...init, headers });
  const list = async (bucket: string, prefix: string) => (await (await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, { method: "POST", headers, body: JSON.stringify({ prefix, limit: 1000 }) })).json()) as { name: string }[];
  const remove = (bucket: string, paths: string[]) => paths.length
    ? fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: paths }) })
    : null;
  const shares = (await (await rest("shares?select=id")).json()) as { id: string }[];
  for (const { id } of Array.isArray(shares) ? shares : []) await remove("share-photos", (await list("share-photos", id)).map((file) => `${id}/${file.name}`));
  await rest(`shares?user_id=eq.${user.id}`, { method: "DELETE" });
  const photos = await list("mix-photos", user.id);
  await remove("mix-photos", (Array.isArray(photos) ? photos : []).map((file) => `${user.id}/${file.name}`));
  await rest(`collections?user_id=eq.${user.id}`, { method: "DELETE" });
  await rest(`mixes?user_id=eq.${user.id}`, { method: "DELETE" });
}
