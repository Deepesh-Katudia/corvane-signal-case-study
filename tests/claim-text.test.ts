import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { loadDataset } from "@/engine/ingest/loadDataset";
import { analyzeResponse, createContext } from "@/engine/analyzeResponse";
import { claimTextFrom } from "@/engine/facts/check";
import type { NormalizedResponse } from "@/engine/types";

const config = loadConfig(path.join(__dirname, "..", "config"));
const ctx = createContext(config);
const answer = (text: string): NormalizedResponse => ({ responseId: "t", week: 1, engine: "chatgpt", promptId: "P01", run: 1, collectedAt: null, text, citations: [], ok: true, error: null, sourceFile: "t" });

describe("claim_text is the claim as it appears in the answer", () => {
  it("keeps bold words (formatting is never deleted from inside the claim)", () => {
    const text = "Corvane Fleet is headquartered in **Chicago**.";
    const [claim] = analyzeResponse(answer(text), ctx).claims.filter((c) => c.verdict === "wrong");
    expect(claim.claimText).toBe("Corvane Fleet is headquartered in **Chicago**.");
  });

  it("trims only list markers, a leading label and citation markers at the edges", () => {
    expect(claimTextFrom("- **If budget matters:** It was founded in **2009**. [3]")).toBe("It was founded in **2009**.");
    expect(claimTextFrom("[2] It also includes built-in AI dashcams.")).toBe("It also includes built-in AI dashcams.");
    expect(claimTextFrom("1. **Corvane Fleet**: Plans start at $45 per vehicle per month.")).toBe("Plans start at $45 per vehicle per month.");
  });

  it("is a verbatim substring of its answer for every wrong fact in the data pack", async () => {
    const pack = await loadDataset(path.join(__dirname, "..", "data", "responses.jsonl"), config.engines);
    const claims = pack.responses.flatMap((r) => analyzeResponse(r, ctx).claims.map((c) => ({ c, text: r.text })));
    expect(claims.length).toBeGreaterThan(95);
    expect(claims.filter(({ c, text }) => !text.includes(c.claimText))).toEqual([]);
  });
});
