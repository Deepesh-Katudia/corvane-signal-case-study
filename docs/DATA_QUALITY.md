# Data quality: what was wrong with the export and what the tool does about it

The tool finds and handles all of these automatically. The *Data & exports* page lists every one with an example.

| Problem in the data pack | How common | What the tool does |
|---|---|---|
| **Week 4 uses different field names:** `answer`, `sources`, `run_number`, `collected` instead of `response_text`, `citations`, `run`, `collected_at` | 90 rows | Field names are matched against a list of known aliases, ignoring case and punctuation (`src/engine/ingest/fieldAliases.ts`). A new file with `output`, `references` or `attempt` also works. |
| **Week 4 engine names differ:** `ChatGPT`, `Perplexity`, `AI Overview` vs `chatgpt`, `perplexity`, `google_ai_overview` | 90 rows | Engines are mapped through `config/engines.json`. Unknown engines are kept under a cleaned name and reported. |
| **Week 4 prompt IDs are lower case** (`p01`) | 90 rows | Upper-cased. |
| **Week 4 dates are `07/09/2026 21:26`**, which could be 7 Sept or 9 July | 90 rows | Ambiguous dates are resolved to the reading closest to the dates of neighbouring weeks: 7 Sept, one week after week 3. |
| **Week 5 has no Perplexity answers** | 30 answers missing | Week 5 is flagged incomplete. Week-on-week changes compare only the question/engine pairs present in both weeks, so the gap can't look like a drop. Week 5 vs 4 for Corvane: full-week scores 36.7 → 35.5, like-for-like change +0.1. |
| **Exact duplicate rows** (same `response_id`) in week 2 ChatGPT | 8 rows | The first copy is kept, or the copy that has text if one is empty. |
| **Collection failures** (`"error": "timeout"`, empty text) | 3 answers | They stay in `mentions.csv` (six rows each, all `false`), because the export asks for every answer. They're excluded from scores, so a timeout can't look like Corvane disappearing. |
| **HTML entities in text** (`&amp;`) | ~15 answers | Decoded before analysis. |
| **Citations missing or `[]`** | 112 rows | Treated as no citations. Strings like `"None"` or `"[\"…\"]"` and lists of `{url: …}` objects are also accepted. |
| **"Corvane Logistics"**, an unrelated freight company | 28 answers | Matched as a look-alike and excluded. Sentences about it (including "The company is headquartered in…" right after it) are never attributed to Corvane. |

Other formats accepted for future files: JSON arrays, `{ "responses": [...] }`, CSV, and numbers stored as text (`"week": "7"`). A missing week is inferred from the collection date. A missing run number gets the next free number. Bad lines are reported and skipped; they don't stop the run.
