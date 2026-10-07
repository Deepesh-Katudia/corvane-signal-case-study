# Corvane Signal: AI Visibility Tracker for Corvane Fleet

## Context
Indexed's case study (`docs/AI-Native_Developer_Case_Study_Corvane_Fleet.pdf`) asks for a web app that turns 6 weeks of AI-engine answers (`docs/corvane_data_pack/`) into:
- **Marcus's Monday view** (the CEO): one score, why it moved, who gained, wrong-fact alerts, suggested actions.
- **Priya's detail and board export** (Head of Marketing).
- **Two graded CSV exports** (`mentions.csv`, `wrong_facts.csv`), checked against a hidden answer key on **unseen data**.

**Hard constraint from the brief:** no paid APIs in the analysis, and everything must run on a laptop with one command. Decisions agreed with the user:
- **Analysis:** a deterministic rules engine drives everything that gets graded. OpenRouter is optional and only rewrites Marcus's "what to do" text when a key is present. LangSmith traces those calls. The tool works fully with no keys.
- **Storage:** local files by default. Supabase sync turns on when env vars are set, and powers the Vercel deployment.
- **Name:** Corvane Signal. Repo: https://github.com/Deepesh-Katudia/Corvane-signal
- **Stretch items, all of them:** Priya detail view, head-to-head, competitor fact-check, sources, config-driven brands/perspective, board export, Vercel deploy.
- **Git:** conventional commits, pushed after each milestone. **No Claude co-author or attribution lines** (explicit user instruction).

### Data issues found during profiling (each must be handled and documented)
| Issue | Handling |
|---|---|
| Week 4 schema drift: `answer`/`sources`/`run_number`/`collected` (DD/MM/YYYY HH:mm), engines `ChatGPT`/`Perplexity`/`AI Overview`, lowercase `p01` | Field-alias map, engine canonicalisation, prompt ID uppercased, date parser that detects day-first |
| Week 5 has no Perplexity | Coverage check, so the week is flagged *partial* and compared like-for-like only |
| Week 2 ChatGPT: 8 exact duplicate `response_id` rows | Dedupe by ID, then by (week, engine, prompt, run) |
| 3 rows with `error: timeout`, empty text; some fields stored as strings (`"None"`, `"[]"`, `"4"`) | Coerce types; failed answers are excluded from scoring but still get 6 `mentioned=false` rows in mentions.csv |
| Name variants: TrakVia, Route Lyne, GridWell, CorvaneFleet, Corvain Fleet, corvanefleet.com, NovaHaul | Alias generation, spacing/case normalisation, edit-distance ≤1 for tokens of 6+ characters |
| "Corvane Logistics" (29 mentions) | Exclusion span, masked before matching, so it never counts as Corvane |

## Architecture
A single Next.js 15 (App Router, TypeScript) package. The engine is pure TypeScript, shared by the CLI, API routes and tests.

```
config/            brands.json, facts.json (default to data pack), aliases.json (extra aliases + exclusions),
                   engines.json (engine name aliases), scoring.json (weights), perspective in brands.json
data/              responses*.jsonl (any number of weekly files), prompts.csv  ← drop a new week here
src/engine/
  ingest/          normalize.ts (field aliases, type coercion, dates, dedupe), quality.ts (data-quality report)
  detect/          aliases.ts (variant generation), mentions.ts (match, mask exclusions, citations ignored, position)
  tone/            segment.ts (sentences/bullets/"Bottom line"), lexicon.ts, tone.ts (final-verdict rule, "but/though" contrast)
  facts/           extractors.ts (price, hq, founded, features.*, integrations), check.ts (contradiction vs unverified, brand attribution incl. "it/its")
  score/           visibility.ts, compare.ts (like-for-like + paired bootstrap noise test), drivers.ts (why it moved / who took it)
  insights/        actions.ts (rule-based recommendations), narrative.ts (optional OpenRouter rewrite + LangSmith, cached, falls back)
  export/          scoringCsv.ts (mentions.csv, wrong_facts.csv exact format), boardReport.ts (XLSX via exceljs + CSV)
  pipeline.ts      runAnalysis(config, responses) → AnalysisResult
src/store/         AnalysisStore interface; FileStore (out/analysis.json) | SupabaseStore (repository pattern)
scripts/analyze.ts CLI: reads data/ → writes out/mentions.csv, out/wrong_facts.csv, out/analysis.json, out/board_report.xlsx
src/app/           pages + route handlers (upload new week, export downloads, perspective switch)
supabase/migrations/ schema: responses (raw jsonb), analysis_runs (jsonb snapshot), mentions, wrong_facts
```

**One command:** `npm install && npm run dev`. A `predev`/`prestart` hook runs `analyze`, so the app and CSVs are always fresh. `npm run analyze -- --data <dir> --out <dir>` lets evaluators run it on their unseen file. Loading a new week means dropping the file into `data/` or using the UI upload. Neither needs code changes, and unknown-but-aliased fields are tolerated.

## Key logic
- **Mention:** match in answer text only (citations ignored). The brand is found by name, a name variant, its website, or a near-miss spelling. Exclusion spans are masked first.
- **Position:** rank by first-match character offset, counting only the 6 brands.
- **Tone:** collect every clause that mentions the brand, plus clauses resolved through pronouns. The **last** verdict-bearing clause wins (the brief's "final verdict" rule). Within a clause, text after "but / though / however" overrides the text before it. Priority when patterns conflict inside one clause: not_recommended > recommended/negative by position > neutral default. The lexicon is built from a full pass over all 518 answers (they are templated), so coverage is high and explainable.
- **Wrong facts:** extract typed claims (`$NN per vehicle`, "based in / headquartered in X", "founded in YYYY", feature present/absent phrases mapped to `features.*`, "integrates with X"). Each claim is attributed to the brand it is about, and flagged only when it contradicts `facts.json`. Claims `facts.json` doesn't cover are shown as *unverified*, never flagged. Covers all 4 tracked brands, with Corvane first.
- **Visibility Score (0–100):** a priority-weighted average over every answered (question × engine × run) of answer points. Recommended = 100, neutral = 50, negative = 25, not recommended or absent = 0, times a position factor (1st 1.0, 2nd 0.85, 3rd+ 0.7). Plain-English version: "out of every 100 points of buyer attention the AI hands out, how many go to you, and in a good light."
- **Honest week-on-week:**
  1. Compare only the (question × engine) cells present in **both** weeks. Week 5's missing Perplexity therefore can't cause a false drop, and the UI says so.
  2. A paired bootstrap over matched cells (fixed seed) gives a 95% interval. The change is labelled "real gain", "real drop" or "within normal variation". Run-1 vs run-2 disagreement is shown as the noise band.
- **Why it moved / who took it:** break the change down by question and engine. For cells where the brand lost points, show which brand gained in the same cells.

## Screens (Next.js, Recharts, Tailwind; distinctive editorial styling, not template)
1. **Monday** (`/`): score cards for 4 brands with change and noise label, a "why it moved" list, gainers and losers, wrong-fact alerts (new this week first), 3–5 suggested actions, and a partial-week banner. A perspective switcher views the market as any tracked brand.
2. **Questions** (`/questions`, Priya): filters for question, engine, stage, company and week. A question × engine matrix drills down to the original answer with every mention highlighted and tone-coloured, plus its citations.
3. **Head-to-head** (`/head-to-head`): winner per question per engine and week, plus "dropped out → replaced by".
4. **Fact alerts** (`/facts`): all brands, each linked to its answer, plus a sales battlecard view for competitor errors.
5. **Sources** (`/sources`): cited domains, with domains that cite competitors but never Corvane highlighted.
6. **Data & exports** (`/data`): data-quality report, week upload, and downloads for mentions.csv, wrong_facts.csv and the board report (XLSX with monthly-ready tables).

## Deliverable documents (the "proof")
- `README.md`: one-command run, assumptions, what was prioritised and why, accuracy check results, how AI tools were used (including what they got wrong and how it was fixed), and the 20-client operations section (cost, storage, engine format changes).
- `NOTE_TO_MARCUS.md`: half a page, plain English.
- `docs/ACCURACY.md`: 15 seeded-random answers, hand-labelled by reading each answer, compared with tool output. Reports mention and tone accuracy, and where it goes wrong. A wider dev-time cross-check using OpenRouter, reviewed by hand, is disclosed separately from the 15-answer hand check.
- `docs/DATA_QUALITY.md`, `docs/ARCHITECTURE.md`, `docs/superpowers/specs/2026-10-07-corvane-signal-design.md` (this design).
- `.env.example` (OPENROUTER_API_KEY, OPENROUTER_MODEL, LANGSMITH_API_KEY, LANGSMITH_PROJECT, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). No secrets are committed.

## Build order (each step = a commit, pushed)
1. `chore:` git init, set remote, .gitignore (node_modules, .env*, out/, brief PDF), Next.js scaffold, data pack into `data/` and `config/`, spec doc.
2. `feat(ingest):` normaliser and quality report, with tests first (schema drift, dupes, errors, string types, dates).
3. `feat(detect):` aliases, mentions, position, with tests (misspellings, Logistics, domains, citations ignored).
4. `feat(tone):` segmenter and tone rules, with tests built from the brief's examples and real templated phrases.
5. `feat(facts):` extractors and checker for all 4 brands, with tests (contradiction vs unverified).
6. `feat(export):` scoring CSVs with exact columns, CLI `analyze`, and a format test (6 rows per answer).
7. `feat(score):` score, like-for-like comparison, bootstrap, drivers, with tests (week-5 partial isn't a drop).
8. `feat(ui):` Monday view, then Questions, Head-to-head, Facts, Sources, Data/exports.
9. `feat(insights):` rule-based actions, optional OpenRouter narrative with LangSmith tracing.
10. `feat(store):` Supabase repository, migrations, upload route. Then deploy to Vercel.
11. `docs:` accuracy check, README, note to Marcus, architecture, data quality.
Then the code-reviewer and security-reviewer agents run over the result, and their findings get fixed.

## Verification
- `npm test` (Vitest): unit tests per engine module, a pipeline test on the real data pack (518 lines → 507 unique answers; mentions.csv = 6 × unique answers; 3 failed answers present as all-false), and a scoring test where a week with an engine removed shows no false drop.
- `npm run analyze`: inspect the CSVs. Spot-check known lines, e.g. `r_b4d2633540f5` has Corvane negative, Corvane Logistics not counted, and a wrong fact `features.eld_compliance`. `r_495db021ac8d` has a Corvane wrong fact on `hq` ("Columbus, Georgia").
- Re-run `analyze` on week 4 alone and on a synthetic altered-schema file, to confirm format tolerance.
- `npm run build && npm start`, then click through every screen in the browser via Playwright, including the perspective switch and uploading a week file.
- Optional LLM path: run with and without `OPENROUTER_API_KEY`. The output must be identical apart from the narrative text, and the trace must show in LangSmith.
- Vercel deploy: open the URL and confirm data loads from Supabase.

## Needed from the user during build
- Keys in `.env.local`: OpenRouter, LangSmith, Supabase project URL and keys. Vercel login for deploy.
- Your name for the README and the submission subject line, and confirmation that git `user.name`/`user.email` are set to you.
