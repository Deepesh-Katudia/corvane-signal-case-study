import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildMatchers } from "@/engine/detect/aliases";
import { findEntitySpans } from "@/engine/detect/mentions";
import { attributeUnits } from "@/engine/detect/attribution";
import { brandTones, classifyText } from "@/engine/tone/tone";
import { segment } from "@/engine/tone/segment";

const config = loadConfig(path.join(__dirname, "..", "config"));
const matchers = buildMatchers(config.brands);

function tones(text: string): Record<string, string> {
  const spans = findEntitySpans(text, matchers);
  const brands = new Set(spans.filter((s) => s.brand).map((s) => s.brand!));
  const out = brandTones(attributeUnits(text, spans), brands);
  return Object.fromEntries([...out].map(([b, v]) => [b, v.tone]));
}

describe("tone: examples from the brief", () => {
  it.each([
    ["For small fleets, Corvane is a strong pick.", { corvane: "recommended" }],
    ["Other options include Corvane and Fleetora.", { corvane: "neutral", fleetora: "neutral" }],
    ["Routelyne is cheap, but users report slow support.", { routelyne: "negative" }],
    ["Avoid Gridwell if you run fewer than 100 vehicles.", { gridwell: "not_recommended" }],
  ])("%s", (text, expected) => {
    expect(tones(text)).toEqual(expected);
  });
});

describe("tone: phrasing seen in the data pack", () => {
  it.each([
    ["Trakvia is often recommended, but recent reviews flag outages and slow fixes, so go in with caution.", "negative"],
    ["Trakvia has had a few billing complaints, but overall it's still one of the better choices for small fleets.", "recommended"],
    ["Trakvia looks impressive in demos, but for small fleets it isn't the right choice.", "not_recommended"],
    ["Some fleets like Trakvia for dashcams, although its contract terms have drawn complaints.", "negative"],
    ["Trakvia covers the basics, though reviewers mention a clunky mobile app.", "negative"],
    ["Trakvia is an option, but setup reportedly takes longer than expected.", "negative"],
    ["For mid-sized fleets, Trakvia is likely overkill, so I'd skip it.", "not_recommended"],
    ["I wouldn't choose Trakvia for small fleets.", "not_recommended"],
    ["Trakvia is probably not the right fit for small fleets.", "not_recommended"],
    ["Reviewers consistently point to Trakvia as the best overall option.", "recommended"],
    ["If you're shopping for small fleets, Trakvia is hard to beat thanks to dashcams.", "recommended"],
    ["Start your shortlist with Trakvia: it offers dashcams.", "recommended"],
    ["**Bottom line:** for small fleets, I'd start with Trakvia.", "recommended"],
    ["- **If compliance is your main concern:** Trakvia focuses on dashcams.", "neutral"],
    ["You may also come across Trakvia.", "neutral"],
    ["Another provider you'll see is Trakvia, known for AI dashcams with driver coaching.", "neutral"],
    ["Trakvia has a polished interface and decent reviews.", "neutral"],
  ])("%s -> %s", (text, tone) => {
    expect(tones(text).trakvia).toBe(tone);
  });

  it("applies a later 'Even so, it's the one I'd pick' to the brand just named", () => {
    expect(tones("Some users find NovaHaul expensive at first. Even so, for field service it's the one I'd pick.")).toEqual({ novahaul: "recommended" });
  });

  it("applies a later 'That said, I'd skip it' to the brand just named", () => {
    expect(tones("Corvane Fleet has a polished interface and decent reviews. That said, for a 20-truck fleet I'd skip it.")).toEqual({ corvane: "not_recommended" });
  });

  it("keeps the verdict when a later factual sentence is neutral", () => {
    expect(tones("For most mid-sized fleets, Corvane is the safest choice. It's based in Columbus, Ohio.")).toEqual({ corvane: "recommended" });
  });

  it("uses the final verdict when an answer is mixed", () => {
    expect(tones("Trakvia is the top pick for safety.\n\n**Bottom line:** avoid Trakvia if you have fewer than 10 trucks.")).toEqual({ trakvia: "not_recommended" });
  });

  it("does not leak Corvane Logistics criticism onto Corvane", () => {
    const text = "Corvane Fleet offers GPS tracking.\nCorvane Logistics is a freight brokerage. Customers mention responsive dispatchers, though some note slow invoicing.";
    expect(tones(text)).toEqual({ corvane: "neutral" });
  });

  it("reads table verdicts from the last column only", () => {
    const text = "| Provider | Best for | Our take |\n|---|---|---|\n| Novahaul | Field service | Best overall |\n| Trakvia | Video safety | Fine, but support complaints |\n| Routelyne | Tight budgets | Skip at your size |\n| Gridwell | Large enterprises | Option to compare |";
    expect(tones(text)).toEqual({ novahaul: "recommended", trakvia: "negative", routelyne: "not_recommended", gridwell: "neutral" });
  });

  it("judges each brand on its own part of a shared sentence", () => {
    expect(tones("Avoid Gridwell for small fleets; Corvane Fleet is the safest choice.")).toEqual({ gridwell: "not_recommended", corvane: "recommended" });
  });
});

describe("segment", () => {
  it("splits sentences but not websites or list numbers", () => {
    const units = segment("1. **Trakvia**: Visit trakvia.com today. It is $29.\n\n- Next bullet.");
    expect(units.map((u) => u.text)).toEqual(["1. **Trakvia**: Visit trakvia.com today.", "It is $29.", "- Next bullet."]);
    expect(units[2].paragraph).toBeGreaterThan(units[0].paragraph);
  });

  it("ends a sentence after a number like 24/7", () => {
    expect(segment("Phone support is available 24/7. Another provider is Trakvia.").map((u) => u.text)).toEqual([
      "Phone support is available 24/7.",
      "Another provider is Trakvia.",
    ]);
  });

  it("returns null tone for plain description", () => {
    expect(classifyText("It integrates with QuickBooks.")).toBeNull();
  });
});
