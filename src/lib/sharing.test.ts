// @vitest-environment node
// Node provides Blob streams, CompressionStream and Web Crypto, which jsdom lacks.
import { deflateRawSync } from "node:zlib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SharePayload } from "../types";
import { createCompressedLink, initialShareState, newShareCode, packPayload, readShareAddress, resolveShare, unpackPayload } from "./sharing";

const mix = { name: "Ember glow", color: "#e0702a", notes: "Glazed over the eyes.", image: "", paints: [{ name: "Averland Sunset", brand: "Citadel", drops: "2", swatch: "#fbb81c" }] };
const payload: SharePayload = { version: 1, kind: "mix", mix };

beforeAll(() => {
  vi.stubGlobal("window", { location: { origin: "https://colour-archive.example" } });
});

describe("compressed links", () => {
  it("round-trips a recipe and is much shorter than plain JSON", async () => {
    const packed = await packPayload(payload);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await unpackPayload(packed)).toEqual(payload);
    const collection: SharePayload = { version: 1, kind: "collection", name: "Set", mixes: Array(5).fill(mix) };
    expect((await packPayload(collection)).length).toBeLessThan(encodeURIComponent(JSON.stringify(collection)).length / 3);
  });

  it("refuses characters outside base64url", async () => {
    await expect(unpackPayload("abc$def")).rejects.toThrow("characters that don't belong");
  });

  it("stops unpacking a link that expands past the size limit (a zip bomb)", async () => {
    // A few hundred characters of link that would inflate to 2 MB.
    const bomb = deflateRawSync(Buffer.from(JSON.stringify({ ...payload, mix: { ...mix, notes: "x".repeat(2_000_000) } }))).toString("base64url");
    expect(bomb.length).toBeLessThan(5000);
    await expect(unpackPayload(bomb)).rejects.toThrow("too large");
  });

  it("leaves photos out when they'd make the link too long", async () => {
    // Real photo data is effectively random, so it barely compresses.
    const photo = Buffer.from(Array.from({ length: 30000 }, () => Math.floor(Math.random() * 256))).toString("base64");
    const withPhoto: SharePayload = { version: 1, kind: "mix", mix: { ...mix, image: `data:image/jpeg;base64,${photo}` } };
    const link = await createCompressedLink(withPhoto);
    expect(link.url.startsWith("https://colour-archive.example/#s=")).toBe(true);
    expect(link).toMatchObject({ short: false, photosIncluded: 0, photosOmitted: 1 });
  });
});

describe("reading the address", () => {
  it("recognises short, compressed and old links", () => {
    expect(readShareAddress("/s/Ab3xK9q2Zz", "")).toEqual({ type: "short", code: "Ab3xK9q2Zz" });
    expect(readShareAddress("/", "#s=abc")).toEqual({ type: "packed", data: "abc" });
    expect(readShareAddress("/", "#share=%7B%7D")).toEqual({ type: "legacy", token: "{}" });
    expect(readShareAddress("/s/short", "")).toBeNull();
    expect(readShareAddress("/collections/x", "")).toBeNull();
  });

  it("decodes old links at once and marks others as loading", () => {
    const legacy = readShareAddress("/", `#share=${encodeURIComponent(JSON.stringify(payload))}`);
    expect(initialShareState(legacy)).toEqual({ status: "ready", payload });
    expect(initialShareState({ type: "packed", data: "x" })).toEqual({ status: "loading" });
    expect(initialShareState(readShareAddress("/", "#share=%7Bbroken"))).toMatchObject({ status: "error" });
  });

  it("resolves a compressed link and rejects a tampered one", async () => {
    const packed = await packPayload(payload);
    expect(await resolveShare({ type: "packed", data: packed })).toEqual({ status: "ready", payload });
    const tampered = await packPayload({ ...payload, mix: { ...mix, image: "javascript:alert(1)" } } as SharePayload);
    expect(await resolveShare({ type: "packed", data: tampered })).toMatchObject({ status: "error" });
  });
});

describe("share codes", () => {
  it("are 10 characters from A–Z, a–z and 0–9, and don't repeat", () => {
    const codes = new Set(Array.from({ length: 500 }, newShareCode));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9]{10}$/);
  });
});
