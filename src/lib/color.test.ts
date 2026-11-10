// @vitest-environment node
import { describe, expect, it } from "vitest";
import { colorDifference, colorFamily, deltaE2000, hexToLab, hueSortKey } from "./color";

describe("deltaE2000", () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula".
  it.each([
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 0, b: 0 }, { l: 50, a: -1, b: 2 }, 2.3669],
    [{ l: 50, a: 2.49, b: -0.001 }, { l: 50, a: -2.49, b: 0.0009 }, 7.1792],
    [{ l: 50, a: 2.5, b: 0 }, { l: 73, a: 25, b: -18 }, 27.1492],
    [{ l: 60.2574, a: -34.0099, b: 36.2677 }, { l: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ l: 22.7233, a: 20.0904, b: -46.694 }, { l: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
  ])("matches the published value for pair %#", (first, second, expected) => {
    expect(deltaE2000(first, second)).toBeCloseTo(expected, 4);
    expect(deltaE2000(second, first)).toBeCloseTo(expected, 4);
  });

  it("is zero for the same colour and large for opposites", () => {
    expect(colorDifference("#2e5e4e", "#2e5e4e")).toBe(0);
    expect(colorDifference("#000000", "#ffffff")).toBeGreaterThan(90);
  });

  it("converts white to L* 100", () => {
    expect(hexToLab("#ffffff").l).toBeCloseTo(100, 2);
  });
});

describe("colorFamily", () => {
  it.each([
    ["#b8322c", "red"], ["#d9792b", "orange"], ["#e2b62f", "yellow"], ["#4f8a3c", "green"],
    ["#3266a8", "blue"], ["#6d4795", "purple"], ["#d4689a", "pink"], ["#6b4a2e", "brown"],
    ["#8a8d88", "neutral"], ["#111111", "neutral"], ["#f5f5f2", "neutral"],
  ])("files %s under %s", (hex, family) => {
    expect(colorFamily(hex)).toBe(family);
  });
});

describe("hueSortKey", () => {
  it("runs round the wheel and puts neutrals last", () => {
    const sorted = ["#8a8d88", "#3266a8", "#b8322c", "#4f8a3c", "#e2b62f"].sort((a, b) => hueSortKey(a) - hueSortKey(b));
    expect(sorted).toEqual(["#b8322c", "#e2b62f", "#4f8a3c", "#3266a8", "#8a8d88"]);
  });
});
