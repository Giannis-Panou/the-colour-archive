import { expect, test } from "@playwright/test";
import { authHeaders, cleanUpLiveUser, signUpAnonymously, SUPABASE_URL, type LiveUser } from "../support";

// Attacks on the live database: a visitor with only the public key, and one signed-in user
// against another. Row-level security and parameterised queries must stop all of them.
test.describe.configure({ mode: "serial" });

let a: LiveUser;
let b: LiveUser;
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64");
const SQL_LEAK = /syntax error|unterminated quoted|at character \d|PL\/pgSQL/i;

async function call(path: string, init: RequestInit & { as?: LiveUser } = {}) {
  const started = Date.now();
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...authHeaders(init.as), Prefer: "return=representation", ...(init.headers as Record<string, string> || {}) } });
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, body, text, ms: Date.now() - started };
}
const rows = (body: unknown) => (Array.isArray(body) ? body as Record<string, unknown>[] : []);

let aMix: { id: string };
let aCollection: { id: string };
let bMix: { id: string };
let bCollection: { id: string };
const aPhoto = () => `${a.id}/a-photo.jpg`;
const shareCode = "LiveTest01";

test.beforeAll(async () => {
  a = await signUpAnonymously();
  b = await signUpAnonymously();
  await fetch(`${SUPABASE_URL}/storage/v1/object/mix-photos/${aPhoto()}`, { method: "POST", headers: { ...authHeaders(a), "Content-Type": "image/jpeg" }, body: jpeg });
  aMix = rows((await call("/rest/v1/mixes", { as: a, method: "POST", body: JSON.stringify({ name: "A's private mix", color: "#112233", notes: "private", paints: [], image_path: aPhoto() }) })).body)[0] as { id: string };
  aCollection = rows((await call("/rest/v1/collections", { as: a, method: "POST", body: JSON.stringify({ name: "A collection" }) })).body)[0] as { id: string };
  await call("/rest/v1/collection_mixes", { as: a, method: "POST", body: JSON.stringify({ collection_id: aCollection.id, mix_id: aMix.id }) });
  await call("/rest/v1/shares", { as: a, method: "POST", body: JSON.stringify({ id: shareCode, payload: { version: 1, kind: "mix", mix: { name: "Shared", color: "#000000", notes: "", image: "", paints: [] } } }) });
  bMix = rows((await call("/rest/v1/mixes", { as: b, method: "POST", body: JSON.stringify({ name: "B mix", color: "#445566", paints: [] }) })).body)[0] as { id: string };
  bCollection = rows((await call("/rest/v1/collections", { as: b, method: "POST", body: JSON.stringify({ name: "B collection" }) })).body)[0] as { id: string };
  expect(aMix?.id && aCollection?.id && bMix?.id && bCollection?.id, "test data created").toBeTruthy();
});

test.afterAll(async () => {
  await cleanUpLiveUser(a);
  await cleanUpLiveUser(b);
});

test("a visitor with only the public key can't read or change any table", async () => {
  for (const table of ["mixes", "collections", "collection_mixes", "shares"]) {
    expect((await call(`/rest/v1/${table}?select=*`)).status, `read ${table}`).toBeGreaterThanOrEqual(400);
    expect((await call(`/rest/v1/${table}`, { method: "POST", body: "{}" })).status, `insert ${table}`).toBeGreaterThanOrEqual(400);
  }
  expect((await call("/rest/v1/rpc/set_updated_at", { method: "POST", body: "{}" })).status).toBe(404);
});

test("user B can't see, change, delete or take over user A's data", async () => {
  expect(rows((await call("/rest/v1/mixes?select=id", { as: b })).body).map((row) => row.id)).toEqual([bMix.id]);
  expect(rows((await call(`/rest/v1/mixes?id=eq.${aMix.id}`, { as: b })).body)).toEqual([]);
  expect(rows((await call("/rest/v1/collection_mixes?select=collection_id", { as: b })).body)).toEqual([]);
  expect(rows((await call("/rest/v1/shares?select=id", { as: b })).body)).toEqual([]);
  expect(rows((await call(`/rest/v1/mixes?id=eq.${aMix.id}`, { as: b, method: "PATCH", body: JSON.stringify({ name: "hacked" }) })).body)).toEqual([]);
  expect(rows((await call(`/rest/v1/mixes?id=eq.${aMix.id}`, { as: b, method: "DELETE" })).body)).toEqual([]);
  expect(rows((await call(`/rest/v1/shares?id=eq.${shareCode}`, { as: b, method: "DELETE" })).body)).toEqual([]);
  expect((await call("/rest/v1/mixes", { as: b, method: "POST", body: JSON.stringify({ name: "planted", color: "#000000", paints: [], user_id: a.id }) })).status).toBe(403);
  expect((await call(`/rest/v1/mixes?id=eq.${bMix.id}`, { as: b, method: "PATCH", body: JSON.stringify({ user_id: a.id }) })).status).toBe(403);
  expect((await call("/rest/v1/mixes", { as: b, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: aMix.id, name: "x", color: "#000000", paints: [] }) })).status).toBeGreaterThanOrEqual(400);
  expect((await call("/rest/v1/collection_mixes", { as: b, method: "POST", body: JSON.stringify({ collection_id: bCollection.id, mix_id: aMix.id }) })).status).toBe(403);
  expect((await call("/rest/v1/collection_mixes", { as: b, method: "POST", body: JSON.stringify({ collection_id: aCollection.id, mix_id: bMix.id }) })).status).toBe(403);
  const stillThere = rows((await call(`/rest/v1/mixes?id=eq.${aMix.id}&select=name`, { as: a })).body);
  expect(stillThere).toEqual([{ name: "A's private mix" }]);
});

test("user B can't read, replace, delete or plant photos in user A's folder", async () => {
  const photo = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, { ...init, headers: { ...authHeaders(b), ...(init.headers as Record<string, string> || {}) } });
  expect((await photo(`authenticated/mix-photos/${aPhoto()}`)).status).toBeGreaterThanOrEqual(400);
  expect((await photo(`sign/mix-photos/${aPhoto()}`, { method: "POST", body: JSON.stringify({ expiresIn: 60 }) })).status).toBeGreaterThanOrEqual(400);
  expect((await photo(`mix-photos/${a.id}/planted.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).status).toBeGreaterThanOrEqual(400);
  expect((await photo(`mix-photos/${b.id}/../${a.id}/traversal.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).status).toBeGreaterThanOrEqual(400);
  expect((await photo(`mix-photos/${b.id}/page.html`, { method: "POST", headers: { "Content-Type": "text/html" }, body: "<script>alert(1)</script>" })).status).toBeGreaterThanOrEqual(400);
  expect((await photo(`share-photos/${shareCode}/9.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).status).toBeGreaterThanOrEqual(400);
  await photo("mix-photos", { method: "DELETE", body: JSON.stringify({ prefixes: [aPhoto()] }) });
  const own = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/mix-photos/${aPhoto()}`, { headers: authHeaders(a) });
  expect(own.status, "A can still open the photo").toBe(200);
});

const INJECTIONS = [
  "' OR '1'='1", "x'; DROP TABLE public.mixes;--", "x' UNION SELECT payload FROM public.shares--",
  "x' UNION SELECT to_jsonb(u) FROM auth.users u--", "') OR ('a'='a", "%", "__________",
  "x' AND (SELECT pg_sleep(4)) IS NULL--", "$$; SELECT pg_sleep(4); $$", "x".repeat(10000),
];

test("get_share() treats every input as a plain code", async () => {
  for (const value of INJECTIONS) {
    const result = await call("/rest/v1/rpc/get_share", { method: "POST", body: JSON.stringify({ share_id: value }) });
    expect(result.status === 200 ? result.body : null, value.slice(0, 30)).toBeNull();
    expect(result.ms, "no injected delay ran").toBeLessThan(3000);
    expect(result.text).not.toMatch(SQL_LEAK);
  }
});

test("hostile text is stored and returned exactly, and runs nothing", async () => {
  for (const text of INJECTIONS.slice(0, 5)) {
    const saved = rows((await call("/rest/v1/mixes", { as: b, method: "POST", body: JSON.stringify({ name: text.slice(0, 70), color: "#445566", notes: text, paints: [{ name: text, brand: text, drops: "1' OR '1'='1", swatch: "#000000" }] }) })).body)[0];
    expect(saved).toMatchObject({ name: text.slice(0, 70), notes: text });
  }
  expect(rows((await call(`/rest/v1/mixes?id=eq.${aMix.id}&select=name`, { as: a })).body)).toEqual([{ name: "A's private mix" }]);
  for (const table of ["mixes", "collections", "collection_mixes", "shares"]) expect((await call(`/rest/v1/${table}?select=*&limit=1`, { as: b })).status, `${table} still exists`).toBe(200);
});

test("filter, sort and column tricks never reach another user's rows", async () => {
  const probes = [
    `/rest/v1/mixes?name=eq.${encodeURIComponent("x' OR '1'='1")}`,
    `/rest/v1/mixes?or=(user_id.eq.${a.id},user_id.eq.${b.id})&select=user_id`,
    `/rest/v1/mixes?user_id=neq.${b.id}`,
    `/rest/v1/mixes?id=in.(${encodeURIComponent(`"${aMix.id}",x",${aMix.id},"y`)})`,
    "/rest/v1/collections?select=*,collection_mixes(*,mixes(*))",
    "/rest/v1/mixes?select=*,users(*)",
    `/rest/v1/mixes?select=${encodeURIComponent("id,(select email from auth.users limit 1)")}`,
    `/rest/v1/mixes?order=${encodeURIComponent("name;DROP TABLE mixes")}`,
    `/rest/v1/mixes?name=eq.${encodeURIComponent("x'||pg_sleep(4)||'")}`,
    "/rest/v1/mixes?name=like.*&select=user_id",
  ];
  for (const probe of probes) {
    const result = await call(probe, { as: b });
    const leaked = rows(result.body).some((row) => row.user_id === a.id || row.id === aMix.id || JSON.stringify(row).includes("A's private mix"));
    expect(leaked, probe).toBe(false);
    expect(result.status, probe).toBeLessThan(500);
    expect(result.ms, probe).toBeLessThan(3000);
  }
});
