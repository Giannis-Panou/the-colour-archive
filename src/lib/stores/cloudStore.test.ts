// @vitest-environment node
import { describe, expect, it } from "vitest";
import { UUID_PATTERN } from "../validation";
import { cloudIdFor } from "./cloudStore";

describe("cloudIdFor", () => {
  it("maps the same backup id to the same cloud id for one person", async () => {
    const first = await cloudIdFor("user-a", "mix-1");
    expect(first).toMatch(UUID_PATTERN);
    expect(await cloudIdFor("user-a", "mix-1")).toBe(first);
  });

  it("gives two people different ids for the same backup, so imports never collide", async () => {
    expect(await cloudIdFor("user-a", "mix-1")).not.toBe(await cloudIdFor("user-b", "mix-1"));
  });

  it("produces version-5 style UUIDs", async () => {
    expect((await cloudIdFor("user-a", "mix-2"))[14]).toBe("5");
  });
});
