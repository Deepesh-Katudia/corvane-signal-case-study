# Accuracy check

## The 15-answer hand check (required by the brief)

**Method.**
1. `npm run accuracy -- --sample` shuffles the 510 successfully collected answers with a fixed seed (`20260817`) and takes the first 15. Anyone can reproduce the same sample.
2. I read each answer and wrote down, without looking at the tool's output, which of the six companies it names, in what order, with what tone (using the brief's definitions and its final-verdict rule), and any claims that contradict `facts.json`.
3. The labels are in [`docs/accuracy/hand_labels.json`](accuracy/hand_labels.json). `npm run accuracy` compares them with the tool.

**Result.**

| Check | Agreement |
|---|---|
| Mentioned / not mentioned (15 answers × 6 companies) | **90 / 90 (100%)** |
| Position (where both say "mentioned") | **37 / 37 (100%)** |
| Tone (where both say "mentioned") | **37 / 37 (100%)** |
| Wrong-fact flags | **3 / 3 (100%)** |

The sample covered the things most likely to break:
- **Answer formats:** a table answer, numbered lists, Perplexity's `[n]` citation markers, a Google answer starting with "AI Overview", and the week-4 schema.
- **Name variants:** "CorvaneFleet", "Route Lyne", "GridWell" and "gridwell.io".
- **Look-alikes:** a "Corvane Logistics" disclaimer.
- **Follow-up sentences:** "That said, … I'd skip it", where the verdict sits in a sentence after the company is named.
- **Contradictions:** a "headquartered in Chicago" claim followed by the correct "Columbus, Ohio" sentence.

**Judgement calls a different reader might make differently.**
- **`r_110435c2047e`:** "best overall option… Note that it doesn't support ELD compliance." I kept the tone *recommended* and treated the ELD sentence as a (wrong) factual caveat, not a change of verdict. An answer key that reads every limitation as criticism would call it *negative*.
- **"Has a polished interface and decent reviews" is labelled *neutral*.** It's mildly positive, but it doesn't suggest choosing the company.

## Why 100% on 15 doesn't mean 100% everywhere

The answers in this data pack are built from a limited set of sentence templates. So a 15-answer sample mostly re-tests patterns the rules were written against. I therefore also checked the whole dataset and stress-tested beyond it:

1. **Every sentence pattern.** All 510 answers were split into sentences, with brand names masked, which gives 795 distinct templates. Every template that names a company but gets no verdict was read by hand to confirm it is genuinely neutral (e.g. "X focuses on…", "You may also come across X"). Every follow-up sentence starting with "it" or "the company" was checked for the company it attaches to.
2. **Every fact claim.** All 95 wrong-fact flags and all "correct" and "unverified" claims were grouped and reviewed. There were no false flags. Ratings ("4.6-star average on Capterra"), "24/7 phone support" and "popular with HVAC contractors" are correctly left unverified.
3. **Every spelling.** Every distinct matched spelling was listed. Nothing that looks like a company name went unmatched; the only leftover lookalike was the ordinary word "routes".
4. **Hand-written stress cases** in phrasings the data pack never uses. These found real failures, most of which were fixed (see "AI tools" in the README). Remaining known weaknesses:

| Phrasing | Tool says | Should be |
|---|---|---|
| "Corvane Fleet? Not great, honestly." | neutral | negative: the verdict sits in a separate fragment with no "it" |
| "It is, however, not what I would buy" | neutral | not recommended: unusual word order |
| "Trakvia beats Corvane Fleet on dashcams." | both neutral | arguably Trakvia favoured: "beats" isn't in the phrase list |
| "corvane fleet is solid and well-priced." | neutral | mildly positive; no explicit recommendation, so defensible |
| Lower-case split names ("route lyne") | not matched | Routelyne: split names must be capitalised to avoid false hits like "fleet or a" |
| Misspellings more than 1–2 letters off ("Korvane") | not matched | Corvane: add to `config/aliases.json` |

**Where it is most likely to go wrong on new data:** tone for verdict phrases outside the phrase lists in `src/engine/tone/lexicon.ts`, and fact claims worded very differently from "based in / founded in / starts at $ / includes / integrates with". Both fail safe: an unknown verdict reads as *neutral*, and an unknown claim isn't flagged, so the tool under-reports rather than inventing wrong facts.
