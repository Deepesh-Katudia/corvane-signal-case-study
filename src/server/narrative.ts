import "server-only";
import { traceable } from "langsmith/traceable";
import type { MondayBrief } from "@/engine/insights/brief";

/**
 * OPTIONAL: rewrites the rule-based Monday brief as a short plain-English note via OpenRouter.
 * It only rephrases numbers the rules engine already produced; it never decides mentions, tone,
 * facts or scores. Without OPENROUTER_API_KEY this feature is simply off.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const TIMEOUT_MS = 20_000;
const cache = new Map<string, string>();

export const narrativeEnabled = (): boolean => !!process.env.OPENROUTER_API_KEY;

function briefFacts(b: MondayBrief): string {
  return JSON.stringify({
    company: b.focusName,
    headline: b.headline,
    incompleteData: b.partialNote,
    scores: b.cards.map((c) => ({ company: c.name, score: c.score?.toFixed(0), weekChange: c.weekly?.delta?.toFixed(1), weekVerdict: c.weekly?.movement, trendChange: c.trend?.delta?.toFixed(1), trendVerdict: c.trend?.movement })),
    whyMoved: b.whyMoved,
    whoGained: b.takers.map((t) => `${t.name} +${t.gained.toFixed(1)}`),
    wrongFacts: b.alerts.slice(0, 4).map((a) => `${a.example} (${a.count} answers)`),
    actions: b.actions.map((a) => a.title),
  });
}

const callOpenRouter = traceable(
  async (facts: string, model: string): Promise<string> => {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Corvane Signal",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          {
            role: "system",
            content:
              "You write a Monday note for a CEO who has two minutes. Use only the numbers and facts given. Do not invent figures, companies or causes. Plain English, no jargon, no markdown headings. Max 120 words: one sentence on winning/losing, one on why, one on the most important wrong fact, then the top two actions.",
          },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenRouter returned an empty answer");
    return text;
  },
  { name: "monday-narrative", run_type: "llm", project_name: process.env.LANGSMITH_PROJECT ?? "corvane-signal" },
);

export async function narrativeFor(brief: MondayBrief, cacheKey: string): Promise<string> {
  const key = `${cacheKey}|${brief.focus}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const text = await callOpenRouter(briefFacts(brief), process.env.OPENROUTER_MODEL || DEFAULT_MODEL);
  cache.set(key, text);
  return text;
}
