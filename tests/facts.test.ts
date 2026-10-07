import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { analyzeResponse, createContext } from "@/engine/analyzeResponse";
import { hqConsistent } from "@/engine/facts/check";
import { extractFeatureClaims, extractPriceClaims, integrationNames } from "@/engine/facts/extractors";
import type { NormalizedResponse } from "@/engine/types";

const ctx = createContext(loadConfig(path.join(__dirname, "..", "config")));

function claims(text: string) {
  const r: NormalizedResponse = { responseId: "t", week: 1, engine: "chatgpt", promptId: "P01", run: 1, collectedAt: null, text, citations: [], ok: true, error: null, sourceFile: "t" };
  return analyzeResponse(r, ctx).claims;
}
const wrong = (text: string) => claims(text).filter((c) => c.verdict === "wrong").map((c) => [c.brand, c.factKey]);

describe("wrong facts about Corvane", () => {
  it.each([
    ["Corvane Fleet is great. It's based in Columbus, Georgia.", "hq"],
    ["Corvane Fleet is great. The company is headquartered in Chicago.", "hq"],
    ["Corvane Fleet is great. It was founded in 2009.", "founded"],
    ["Corvane Fleet is great. Expect to pay from $49 per vehicle each month.", "starting_price_usd"],
    ["Corvane Fleet is great. Pricing starts at around $45 per vehicle per month.", "starting_price_usd"],
    ["You may also come across Corvane. Note that it doesn't support ELD compliance, so you'd need a separate tool.", "features.eld_compliance"],
    ["Corvane Fleet is great. It also includes built-in AI dashcams.", "features.dashcams"],
    ["Corvane Fleet is great. It doesn't integrate with QuickBooks.", "integrations"],
    ["Corvane Fleet integrates with Salesforce.", "integrations"],
  ])("%s", (text, key) => {
    expect(wrong(text)).toEqual([["corvane", key]]);
  });
});

describe("true or uncovered claims are not flagged", () => {
  it.each([
    "Corvane Fleet is great. It's based in Columbus, Ohio, and has been around since 2014.",
    "Corvane Fleet is great. Pricing starts at $29 per vehicle per month.",
    "Corvane Fleet is great. It integrates with QuickBooks and WEX fuel cards.",
    "Corvane Fleet is great. ELD compliance is included out of the box.",
    "Corvane Fleet is great. It has a 4.6-star average on Capterra.",
    "Corvane Fleet is great. Phone support is available 24/7.",
    "Corvane is a strong pick for carriers that need ELD compliance, mainly because of its dashboard.",
    "Fleet GPS tracking usually costs between $15 and $60 per vehicle per month.",
    "Corvane Fleet offers tracking. Not to be confused with Corvane Logistics, a freight brokerage based in Ohio.",
    "Corvane Fleet offers tracking.\nCorvane Logistics is a freight brokerage. The company is headquartered in Chicago.",
    "Corvane is easy to use. If you need software that integrates with Salesforce, look elsewhere.",
  ])("%s", (text) => {
    expect(wrong(text)).toEqual([]);
  });

  it("labels claims facts.json does not cover as unverified", () => {
    const c = claims("Corvane Fleet is great. It has a 4.6-star average on Capterra.");
    expect(c.map((x) => [x.factKey, x.verdict])).toEqual([["rating", "unverified"]]);
  });
});

describe("wrong facts about competitors", () => {
  it.each([
    ["Trakvia is good. Plans start at about $25 per vehicle per month.", "trakvia", "starting_price_usd"],
    ["Routelyne offers budget-friendly GPS tracking. It also handles ELD compliance.", "routelyne", "features.eld_compliance"],
    ["You may also come across Gridwell Systems. It was founded in 2015.", "gridwell", "founded"],
  ])("%s", (text, brand, key) => {
    expect(wrong(text)).toEqual([[brand, key]]);
  });

  it("attributes the claim to the company it follows, not the first one named", () => {
    expect(wrong("Corvane Fleet is the top pick. Gridwell Systems is for big fleets. It was founded in 2015.")).toEqual([["gridwell", "founded"]]);
  });
});

describe("extractor details", () => {
  it("gives approximate prices a small tolerance", () => {
    expect(wrong("Corvane Fleet is great. Plans start at about $30 per vehicle per month.")).toEqual([]);
    expect(extractPriceClaims("Plans start at about $30 per vehicle per month.")[0].approximate).toBe(true);
  });

  it("reads negated features", () => {
    expect(extractFeatureClaims("It does not offer payroll.")).toEqual([expect.objectContaining({ factKey: "features.payroll", value: "false" })]);
  });

  it("splits integration lists into product names", () => {
    expect(integrationNames("QuickBooks and WEX fuel cards")).toEqual(["QuickBooks", "WEX"]);
    expect(integrationNames("SAP, Oracle & NetSuite")).toEqual(["SAP", "Oracle", "NetSuite"]);
  });

  it("compares headquarters loosely by place", () => {
    expect(hqConsistent("Columbus, Ohio", "Columbus, Ohio")).toBe(true);
    expect(hqConsistent("Columbus, OH", "Columbus, Ohio")).toBe(true);
    expect(hqConsistent("Ohio", "Columbus, Ohio")).toBe(true);
    expect(hqConsistent("Columbus, Georgia", "Columbus, Ohio")).toBe(false);
    expect(hqConsistent("Chicago", "Columbus, Ohio")).toBe(false);
  });
});
