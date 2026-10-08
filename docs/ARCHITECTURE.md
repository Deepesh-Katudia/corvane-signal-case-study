# Architecture

```
data/*.xlsx|csv|jsonl|json   (bundled weeks + weeks uploaded through the app)
                       ▼
 ingest/   parseFile → normalizeRecords → Dataset      (field aliases, dedupe, dates, coverage)
                       ▼
 detect/   findEntitySpans → brandPositions            (variants, misspellings, look-alike masking)
           attributeUnits                              (sentences/table rows → which company each is about)
 tone/     brandTones                                  (clause-level verdicts, final verdict wins)
 facts/    extractAllClaims → judgeClaim               (price, HQ, founded, features, integrations)
                       ▼
 analyzeResponse → AnalyzedResponse (mentions × 6 brands, claims)
                       ▼
 score/    buildCells → weightedScore                  (Visibility Score)
           compareWeeks / poolCells                    (like-for-like, permutation noise test, 3-week trend)
           explainChange, cellWinners, replacements, sourceStats
                       ▼
 pipeline.runAnalysis → AnalysisResult
        ├── export/scoringCsv  → mentions.csv, wrong_facts.csv
        ├── export/boardReport → board_report.xlsx
        └── insights/brief     → Monday brief (headline, why, takers, alerts, actions)
                       ▼
 Next.js app (src/app)  ·  CLI (scripts/analyze.ts)
```

**Principles**
- **The engine is pure TypeScript.** `src/engine/**` has no I/O except the config and dataset loaders. The CLI, the web app and the tests all call the same functions.
- **Everything that's graded is deterministic.** No network calls and no LLM are involved. The permutation test uses a seeded random number generator, so the same data always gives the same verdicts.
- **Configuration over code.** Extra spellings, look-alikes, engines, scoring weights and the default perspective live in `config/`; the client-supplied `brands.json` and `facts.json` live in `data/` with the rest of the data pack. To add a competitor, add it to `data/brands.json` (and optionally `facts.json` and `config/aliases.json`). To view the market as Trakvia, set `"perspective": "trakvia"` in `config/settings.json`.
- **Local files only.** Every week is a raw file in `data/`, and uploads through the app are saved there too. No database, no API keys, no network. The analysis is recomputed from the raw files whenever their contents change. On this data that takes about 1–2 s, so no derived tables need migrating when the rules improve.

**Tests** (`npm test`, 127): ingest edge cases, every name variant, look-alike exclusion, brief tone examples plus every template family, fact contradiction vs unverified, the noise test, the incomplete-week rule, export format, and a new-format week end to end.
