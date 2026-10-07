import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildDataset, loadDataset, readSourceFile } from "@/engine/ingest/loadDataset";
import { runAnalysis } from "@/engine/pipeline";
import { buildBrief, changeText } from "@/engine/insights/brief";
import { factImpact } from "@/engine/insights/alerts";
import type { WeekComparison } from "@/engine/score/compare";

const root = path.join(__dirname, "..");
const base = loadConfig(path.join(root, "config"));
const config = { ...base, scoring: { ...base.scoring, noiseIterations: 400 } };

// The official six-week pack, and the same pack plus the sample week 7 workbook.
const pack = await loadDataset(path.join(root, "data", "responses.jsonl"), config.engines);
const week7 = buildDataset([await readSourceFile(path.join(root, "samples", "week7_answers.xlsx"))], null, config.engines);
const sixWeeks = buildBrief(runAnalysis(pack, config));
const sevenWeeks = buildBrief(
  runAnalysis({ ...pack, responses: [...pack.responses, ...week7.responses], issues: [...pack.issues, ...week7.issues], files: [...pack.files, ...week7.files] }, config),
);

const cmp = (delta: number, movement: WeekComparison["movement"]): WeekComparison =>
  ({ brand: "corvane", week: 7, previousWeek: 6, current: 0, previous: 0, delta, noiseBand: 7, pValue: 0.5, movement, matchedCells: 45 });

describe("change wording", () => {
  it("says a rise happened but is not yet confirmed, never 'no change'", () => {
    const t = changeText(cmp(8.9, "normal_variation"), "since last week");
    expect(t).toBe("up 8.9 points since last week, within normal variation (not yet confirmed)");
    expect(t).not.toMatch(/no (real )?change/i);
  });

  it("calls confirmed movements confirmed", () => {
    expect(changeText(cmp(-6.9, "real_drop"), "over 3 weeks")).toBe("down 6.9 points over 3 weeks, a confirmed change");
  });
});

describe("executive opening", () => {
  it("states position and confirmation in one sentence", () => {
    expect(sixWeeks.status).toMatch(/^Corvane Fleet trails Trakvia this week\./);
    expect(sevenWeeks.status).toBe("Corvane Fleet leads this week. Improvement is not yet confirmed.");
  });

  it("has Visibility, Watch and This week lines", () => {
    expect(sevenWeeks.execLines.map((l) => l.label)).toEqual(["Visibility", "Watch", "This week"]);
    expect(sevenWeeks.execLines[0].text).toMatch(/^43\/100 · up 8\.9 points since last week, within normal variation \(not yet confirmed\)\.$/);
    expect(sevenWeeks.execLines[1].text).toBe("Gridwell Systems' longer-term rise (+5.8 points: weeks 5–7 compared with weeks 2–4, confirmed).");
    expect(sevenWeeks.execLines[2].text).toMatch(/^Investigate incorrect (pricing and headquarters|headquarters and pricing) claims/);
  });

  it("summarises data confidence with usable vs collected answers", () => {
    expect(sevenWeeks.dataLine).toMatch(/89 usable answers out of 90 · 3 engines · from week7_answers\.xlsx/);
  });
});

describe("alerts", () => {
  it("lists this week's claims first, and rates price and missing-feature claims as high impact", () => {
    const thisWeek = sevenWeeks.alerts.filter((a) => a.thisWeek);
    expect(sevenWeeks.alerts.slice(0, thisWeek.length).every((a) => a.thisWeek)).toBe(true);
    expect(thisWeek[0].factKey).toBe("starting_price_usd");
    expect(factImpact("hq", "Dayton, Ohio")).toBe("low");
    expect(factImpact("features.eld_compliance", "does not have it")).toBe("high");
  });

  it("records when an older claim was last seen", () => {
    const chicago = sevenWeeks.alerts.find((a) => a.claimedValue === "Chicago")!;
    expect(chicago).toMatchObject({ thisWeek: false, lastSeenWeek: 6 });
  });
});

describe("actions", () => {
  it("every action has a priority, an owner and an evidence link", () => {
    for (const a of [...sixWeeks.actions, ...sevenWeeks.actions]) {
      expect(["High", "Medium", "Low"]).toContain(a.priority);
      expect(a.owner.length).toBeGreaterThan(0);
      expect(a.evidence.href).toMatch(/^\//);
    }
  });

  it("never claims a cited site holds the error; it asks to check the page first", () => {
    const facts = sevenWeeks.actions.filter((a) => a.kind === "fix_fact");
    expect(facts.length).toBeGreaterThan(0);
    for (const a of facts) {
      expect(a.why).not.toMatch(/update their listing/);
      expect(a.why).toMatch(/if their information is wrong, request a correction/);
    }
  });

  it("says 'watch' when the movement is not confirmed and 'win back' when it is", () => {
    expect(sevenWeeks.actions.find((a) => a.title.startsWith("Watch"))?.kind).toBe("watch_question");
    expect(sixWeeks.actions.find((a) => a.kind === "win_question" && a.next.startsWith("Publish a page"))).toBeTruthy();
  });
});
