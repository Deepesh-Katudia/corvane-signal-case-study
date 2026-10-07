# Corvane Signal

**AI visibility tracking for Corvane Fleet.** Corvane Signal reads what ChatGPT, Perplexity and Google AI Overviews say when buyers ask about fleet software. It finds every company they name, judges how they talk about it, catches false claims, and turns six weeks of messy answers into one honest score and a Monday screen the CEO can read in two minutes.

> Case study: AI-Native Developer, Indexed. All companies and data are fictional.
> 📄 [Note to Marcus](NOTE_TO_MARCUS.md) · 🎯 [Accuracy check](docs/ACCURACY.md) · 🧹 [Data quality](docs/DATA_QUALITY.md) · 🏗 [Architecture](docs/ARCHITECTURE.md)

---

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # analyses data/ and opens the app at http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run analyze` | Writes `out/mentions.csv`, `out/wrong_facts.csv`, `out/board_report.xlsx` and `out/analysis.json` from everything in `data/` |
| `npm run analyze -- --data path/to/new_week.jsonl --out results/` | Runs on any file or folder, e.g. unseen data |
| `npm test` | 124 tests (detection, tone, facts, scoring, formats) |
| `npm run accuracy` | Re-runs the 15-answer hand check (`-- --sample` prints the sample) |

**Adding a new week needs no code changes.** Drop the file into `data/` (any name, `.jsonl`, `.json` or `.csv`), or upload it on the *Data & exports* page. Field names, engine names, ID casing and date formats are mapped automatically. See [Data quality](docs/DATA_QUALITY.md).

**Nothing paid is needed.** All analysis is rules plus open-source code and runs offline. Optional extras, all off by default (see `.env.example`):
- `OPENROUTER_API_KEY` adds a short AI-written summary under the suggested actions. It only rephrases numbers the rules already produced, and the brief is complete without it. Traced in LangSmith if `LANGSMITH_API_KEY` is set.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` store uploaded weeks in Supabase (used by the deployed version). Apply `supabase/migrations/*.sql` first.
- `UPLOAD_TOKEN` protects uploads on a public deployment. Without it, uploads are disabled on Vercel.

## What's in the app

| Page | For | Shows |
|---|---|---|
| **Monday brief** | Marcus | One-line verdict, scores for Corvane + 3 competitors with *real vs noise* labels, why the score moved (by question and engine), who took ground, wrong-fact alerts, up to 5 suggested actions, 6-week chart |
| **Questions & answers** | Priya | Question × engine grid (each dot is one answer, coloured by tone), filters for week, engine, buying stage, question and company, drill-down to the original answer with every mention highlighted and the sentence that decided its tone |
| **Head-to-head** | both | Winner of each question on each engine; who replaced a company that dropped out |
| **Wrong facts** | sales | False claims about Corvane, plus a battlecard of false claims about Trakvia, Routelyne and Gridwell |
| **Sources** | marketing | Which sites the engines cite and who appears next to them; sites citing competitors but never Corvane; where Corvane is under-represented |
| **Data & exports** | Priya | Board report (Excel), scoring CSVs, week coverage, every data problem handled, upload |

**Viewing as** (top right) shows the whole market from Trakvia's, Routelyne's or Gridwell's side. It's also configurable in `config/settings.json`, and new competitors can be added in `config/brands.json`. No code changes needed.

## How the score works

Every answer gives each company points: **100** if it recommends it, **50** if it just names it, **25** if it criticises it, **0** if it advises against it or leaves it out. Being named 2nd counts ×0.85, and 3rd or later ×0.7. The **Visibility Score** is the average over all answers, weighted by question priority (1–3). In plain terms: of all the attention the AI hands out, how much goes to you, and in a good light.

**Honest change.**
1. **Like-for-like.** A week is compared with the previous one only on question/engine pairs collected in both. Week 5 has no Perplexity answers, so it can't produce a false drop.
2. **Real or noise.** To decide, the two weeks' runs are shuffled within each pair 2,000 times (seeded, so results are reproducible). A change is **real** only if it's bigger than 95% of the shuffled changes. Week to week, that noise is about ±10 points. So the brief also compares the latest 3 weeks with the 3 before them, which is where the real signal shows up.

What the data says today:
- **Corvane:** −6.9 over weeks 4–6 vs 1–3, a real drop.
- **Routelyne:** +11.7, a real gain.
- **Trakvia:** now leads on score.
- **Wrong facts:** 95 false claims (47 about Corvane).

## Assumptions

- **Brand keys** are the first word of each name (`Corvane Fleet` → `corvane`), matching `facts.json` and the export spec.
- **Mentions** include names, spacing/case variants (`Route Lyne`, `CorvaneFleet`), websites, and misspellings within 1 letter (2 for long names). Split names must be capitalised, so ordinary words like "fleet or a" are never read as "Fleetora". "Corvane Logistics" is a different company and never counts.
- **Tone** uses the brief's final-verdict rule.
  - The last sentence that judges a company decides its tone. Inside a sentence, text after *but/though/however* wins.
  - "It/the company" sentences ("Even so, it's the one I'd pick") apply to the company named just before them.
  - Factual caveats ("Note that it doesn't support ELD") are claims, not verdicts.
  - In tables, the verdict column ("Our take") decides.
- **Failed answers** (timeouts or empty text) appear in `mentions.csv` as not mentioned, as the export requires every answer, but are excluded from scores.
- **Duplicates.** A duplicate `response_id` keeps the first copy, or the copy that has text.
- **Week and date.** If a row has no week, the week is inferred from its collection date. If it has neither, it is exported but not scored. Ambiguous dates like `07/09/2026` resolve to the reading nearest the neighbouring weeks.
- **Wrong facts** are only contradictions of `facts.json`.
  - Integrations are treated as a complete list, so claiming an unlisted integration counts as wrong.
  - Prices said to be "about/around" get ±5%.
  - "Ohio" or "Columbus" alone is consistent with "Columbus, Ohio"; "Columbus, Georgia" is not.
  - Ratings, support hours and customer types aren't in `facts.json`, so they are shown as unverified and never flagged.
- **`claim_text`** is the sentence containing the claim, with markdown bullets, bold labels and `[n]` markers removed.
- **Incomplete weeks.** A week is incomplete if an engine is missing or coverage is below 90%.
- **Sources.** No third-party site in this data cites competitors without ever citing Corvane, at domain or page level. The Sources page says so, and shows where Corvane is under-represented instead.

## What I prioritised, and why

1. **The graded core first:** detection, position, tone, wrong facts, the exact CSV format, and handling the messy data. Wrong answers here make every later screen wrong, and the export is checked against an answer key on unseen data. That's why the engine is plain rules, deterministic, and tested on formats the data pack doesn't contain.
2. **A score that tells the truth about uncertainty.** Marcus asked for "one number" but also "why it moved". With two runs per question, weekly moves are mostly noise, so the tool says that rather than inventing stories. It explains the moves that are real.
3. **The Monday screen**, then Priya's detail view, because they turn numbers into decisions.
4. **All stretch items,** in order of usefulness: competitor fact-checking (cheap once the fact engine existed, and directly useful to sales), head-to-head, sources, no hard-coding, board report, deployment.

Deliberately left out:
- **Sentiment models and LLM labelling.** The brief rules out paid APIs, and rules are explainable and auditable.
- **User accounts.**
- **A database of derived tables.** Analysis recomputes from raw files in about 2 seconds, so improving a rule never needs a migration.

## Accuracy check

The full write-up is in [docs/ACCURACY.md](docs/ACCURACY.md). On 15 seeded-random answers labelled by hand, agreement was:

| Check | Agreement |
|---|---|
| Mentions | 90/90 |
| Positions | 37/37 |
| Tones | 37/37 |
| Wrong-fact flags | 3/3 |

That is 100%, but it mostly reflects how templated this data pack is, so I also checked beyond the sample:
- reviewed every one of the 795 sentence templates and all 95 wrong-fact flags
- stress-tested phrasings the data never uses

That surfaced real failures, which are now fixed: comparisons, "avoid overpaying", negated recommendations, and wrong features inside lists. The remaining known weaknesses (verdicts in separate fragments, unusual word order, very distorted misspellings) are listed in the doc. **It fails safe:** an unknown verdict reads as neutral, and an unknown claim isn't flagged.

## How I used AI tools

I built this with **Claude Code** as a pair programmer. It read the brief and profiled the data, proposed the architecture, wrote most of the code and tests, and drove a browser to check the UI. I made the product decisions:
- rules over LLMs
- the shape of the score
- the noise test
- what goes on Marcus's screen

I also reviewed the output against the data. Separate code-review and security-review passes were run as well, and their findings were fixed (commit history shows each step).

**What it got wrong, and how it was fixed:**
- **It wanted to use the OpenRouter models for tone and fact extraction.** That contradicts the brief's no-paid-API rule and would fail on the graders' unseen data. Rules became the core, and the LLM became an optional summary only.
- **Its first plan quoted the wrong response ID** for the "Columbus, Georgia" example, and expected 507 unique answers instead of 510. Both were caught by running the code against the data.
- **A scripted regex edit silently inserted control characters** (a `\b` became a backspace), which broke patterns without failing the type check. I found it by grepping for control characters and added that check to my workflow.
- **The sentence splitter's list-number guard** stopped "available 24/7. Another provider…" from splitting.
- **Joining split names** read lower-case "nova haul" as Novahaul. Split names now have to be capitalised.
- **"Note that it doesn't support…" was discarded** as buyer language because of "that it". The pattern was narrowed.
- **"Why it moved" first explained a week-to-week change that was itself noise.** It now explains the real 3-week trend. "Who gained" also first credited takers across a whole question instead of the exact engine.
- **Suggested outreach included asking fmcsa.dot.gov** (a government site) to fix a listing. Outreach is now limited to review, media and forum sites.
- **The code review found tone and fact gaps outside the data pack's templates.** They were fixed test-first, with the data-pack output verified byte-identical after each change.

## Running this every day for 20 clients

**Shape.** Each client gets a config (brands, aliases, facts, questions). A scheduler collects answers from each engine's API on a set cadence, writes raw JSONL to object storage (one file per client, engine and day), and runs the same pipeline. Results go to Postgres (Supabase) for the app. Analysis is pure CPU and cheap: about 2 seconds for 500 answers, so 20 clients fit on one small worker.

**Cost.** Collection dominates. 20 clients × ~30 questions × 4 engines × 2 runs a day is about 4,800 queries a day, roughly 150k a month. At typical API or search-grounded prices of about $0.002–0.01 per query, that's about $300–1,500 a month, depending on engines and models. Compute is about $20–50 a month, and storage is negligible. To cut costs:
- run high-priority questions daily and the rest weekly
- keep two runs only where the noise test needs them
- cache engine answers within a day

**Storage.** About 1 KB per answer, so roughly 150 MB a month raw, or under 2 GB a year, kept forever because the rules can be re-run over history. Postgres holds only per-answer results and weekly aggregates, partitioned by client and month.

**When an engine changes its format.**
- **The ingest layer absorbs renamed fields.** It already maps renamed fields, engine names and date styles, so most changes are a one-line alias.
- **Changes are detected, not assumed.** Every run produces a data-quality report: unknown fields, coverage below 90%, an engine's mention rate collapsing, or a sudden drop in matched sentences. Each of these raises an alert instead of quietly changing scores.
- **Incomplete weeks never become false drops**, because comparisons are like-for-like.
- **Regression tests catch drift.** A small "golden set" of hand-labelled answers per engine is re-run in CI, so a parser or lexicon change that alters labels is caught before release. New phrasings found in alerts are added to the lexicon with a test.

## Deployment

Deployed on Vercel (Next.js) with Supabase for uploaded weeks. Uploads on the public deployment require `UPLOAD_TOKEN`. Security headers, rate limits and insert-only storage are in place (see `next.config.ts` and `src/app/api/upload/route.ts`).

## Project layout

```
config/        brands, facts, aliases, engines, scoring weights, perspective   ← change behaviour here
data/          weekly answer files + prompts.csv                               ← drop new weeks here
src/engine/    the analysis engine (pure TypeScript, no network)
src/app/       Next.js pages and API routes
scripts/       analyze (CLI) and accuracy
tests/         Vitest suites
docs/          accuracy, data quality, architecture, design spec
```
