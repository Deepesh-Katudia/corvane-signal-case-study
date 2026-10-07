import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildMatchers, editDistance } from "@/engine/detect/aliases";
import { brandPositions, findEntitySpans } from "@/engine/detect/mentions";

const config = loadConfig(path.join(__dirname, "..", "config"));
const matchers = buildMatchers(config.brands);
const brandsIn = (text: string) => findEntitySpans(text, matchers).filter((s) => s.brand).map((s) => s.brand);

describe("brand detection", () => {
  it.each([
    ["Corvane Fleet is a strong pick.", "corvane"],
    ["CORVANE Fleet is a strong pick.", "corvane"],
    ["CorvaneFleet is a strong pick.", "corvane"],
    ["Corvain Fleet is a strong pick.", "corvane"],
    ["Corvane is a strong pick.", "corvane"],
    ["I'd start with corvanefleet.com.", "corvane"],
    ["Trakvia, TrakVia and trakvia.com", "trakvia"],
    ["Route Lyne stands out.", "routelyne"],
    ["RouteLyne stands out.", "routelyne"],
    ["GridWell offers analytics.", "gridwell"],
    ["Gridwell Systems offers analytics.", "gridwell"],
    ["See gridwell.io for details.", "gridwell"],
    ["NovaHaul and Fleetora", "novahaul"],
  ])("finds %s", (text, brand) => {
    expect(brandsIn(text)).toContain(brand);
  });

  it("catches unseen near-miss spellings", () => {
    expect(brandsIn("Trakiva is popular.")).toEqual(["trakvia"]);
    expect(brandsIn("Routelyn is cheap.")).toEqual(["routelyne"]);
    expect(brandsIn("Gridwel is enterprise-grade.")).toEqual(["gridwell"]);
  });

  it("never counts Corvane Logistics as Corvane", () => {
    const spans = findEntitySpans("Not to be confused with Corvane Logistics, a freight brokerage based in Ohio.", matchers);
    expect(spans.filter((s) => s.brand)).toHaveLength(0);
    expect(spans[0].entity).toBe("excluded:corvane");
  });

  it("still finds Corvane Fleet in the same answer as Corvane Logistics", () => {
    expect(brandsIn("Corvane Fleet is great. Not to be confused with Corvane Logistics.")).toEqual(["corvane"]);
  });

  it("does not glue ordinary words into a brand name", () => {
    expect(brandsIn("Choose a fleet or a van, not a nova haul truck.")).toEqual([]);
    expect(brandsIn("The fleet route line is long.")).toEqual([]);
  });

  it("matches a website inside a URL in the text and highlights the domain", () => {
    const spans = findEntitySpans("Read https://www.trakvia.com/blog first.", matchers);
    expect(spans[0]).toMatchObject({ brand: "trakvia", text: "trakvia.com" });
  });

  it("orders positions by first appearance and ignores repeats", () => {
    const spans = findEntitySpans("**Trakvia**: Trakvia leads. Corvane Fleet follows. Trakvia again. Fleetora last.", matchers);
    expect(Object.fromEntries(brandPositions(spans))).toEqual({ trakvia: 1, corvane: 2, fleetora: 3 });
  });

  it("computes edit distance with transpositions", () => {
    expect(editDistance("trakvia", "trakiva")).toBe(1);
    expect(editDistance("corvane", "corvain")).toBe(2);
  });
});
