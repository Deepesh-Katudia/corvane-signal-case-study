/**
 * Generates samples/week7_answers.xlsx: a realistic, fictional "next week" of AI answers to test adding a
 * week. It deliberately uses an Excel-style layout ("Response ID", "Week" = "W7", real Excel dates, sources
 * one per line) and plants new quirks: a "Trak-Via" spelling, a timeout row, a Corvane Logistics mention and
 * new wrong facts. Sheet 2 is the answer key the generator knows, so the tool can be scored on it.
 *
 *   npm run sample-week
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { mulberry32 } from "../src/engine/score/compare";
import type { Tone } from "../src/engine/types";

const WEEK = 7;
const OUT = path.join("samples", "week7_answers.xlsx");
const rng = mulberry32(7007);
const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
const chance = (p: number) => rng() < p;

const NAMES: Record<string, string[]> = {
  corvane: ["Corvane Fleet", "Corvane Fleet", "Corvane", "CorvaneFleet", "corvanefleet.com"],
  trakvia: ["Trakvia", "TrakVia", "Trak-Via", "trakvia.com"],
  routelyne: ["Routelyne", "RouteLyne", "Route Lyne"],
  gridwell: ["Gridwell Systems", "Gridwell", "GridWell"],
  fleetora: ["Fleetora"],
  novahaul: ["Novahaul", "NovaHaul"],
};
const DESC: Record<string, string[]> = {
  corvane: ["GPS tracking and compliance built for small and mid-sized fleets", "easy ELD compliance alongside simple GPS tracking", "good fuel card integrations and a driver app people actually use"],
  trakvia: ["AI dashcams with driver coaching", "a video-first approach to fleet safety"],
  routelyne: ["budget-friendly GPS tracking", "very low monthly pricing"],
  gridwell: ["enterprise-grade analytics for large fleets", "deep customisation for big operations"],
  fleetora: ["fuel management and fuel card controls"],
  novahaul: ["field service scheduling and dispatch"],
};
const PROMPTS: Array<[string, string]> = [
  ["P01", "small trucking companies"], ["P02", "fleets on a tight budget"], ["P03", "carriers that need ELD compliance"],
  ["P04", "field service businesses"], ["P05", "small and mid-sized fleets"], ["P06", "a fleet of 30 to 80 vehicles"],
  ["P07", "small fleets"], ["P08", "fleets focused on driver safety"], ["P09", "small fleets"], ["P10", "a 50-truck operation"],
  ["P11", "mid-sized fleets"], ["P12", "fleets trying to cut fuel spend"], ["P13", "carriers that need ELD compliance"],
  ["P14", "fleets that run their books in QuickBooks"], ["P15", "a 20-truck fleet"],
];
// Week 7 story: Corvane wins back field service (P04) and pricing (P09); Routelyne cools off.
const REC_BIAS: Record<string, number> = { corvane: 0.32, trakvia: 0.42, routelyne: 0.28, gridwell: 0.15, fleetora: 0.2, novahaul: 0.25 };
const SOURCES = [
  "https://www.g2.com/categories/fleet-management", "https://www.capterra.com/fleet-management-software/", "https://www.fleetowner.com/technology/telematics",
  "https://corvanefleet.com/features/", "https://www.trakvia.com/pricing", "https://routelyne.com/", "https://www.reddit.com/r/Truckers/comments/1f3k2x/which_gps_tracker_do_you_use/",
  "https://www.techradar.com/best/best-fleet-management-software", "https://gridwell.io/features",
];

const PHRASES: Record<Tone, Array<(x: string, aud: string, d: string) => string>> = {
  recommended: [
    (x, a) => `If I had to pick one for ${a}, it would be ${x}.`,
    (x, a) => `For most ${a}, ${x} is the safest choice.`,
    (x, a) => `Reviewers consistently point to ${x} as the best overall option for ${a}.`,
    (x, _a, d) => `${x} stands out for ${d}, which is why it's the top suggestion here.`,
    (x, _a, d) => `Start your shortlist with ${x}: it offers ${d}.`,
  ],
  neutral: [
    (x, _a, d) => `${x} offers ${d}.`,
    (x, _a, d) => `Another provider you'll see is ${x}, known for ${d}.`,
    (x) => `You may also come across ${x}.`,
    (x, _a, d) => `${x} also operates in this space, with ${d}.`,
  ],
  negative: [
    (x) => `${x} covers the basics, though reviewers mention a clunky mobile app.`,
    (x, _a, d) => `${x} offers ${d}, but some users report slow customer support.`,
    (x) => `${x} is an option, but setup reportedly takes longer than expected.`,
  ],
  not_recommended: [
    (x, a) => `I wouldn't choose ${x} for ${a}.`,
    (x, a) => `For ${a}, ${x} is likely overkill, so I'd skip it.`,
    (x, a) => `${x} is probably not the right fit for ${a}.`,
  ],
};

/** Extra fact sentences: [brand, text, wrongFactKey | null]. */
const FACTS: Array<[string, string, string | null]> = [
  ["corvane", "It's based in Columbus, Ohio, and has been around since 2014.", null],
  ["corvane", "Pricing starts at $29 per vehicle per month.", null],
  ["corvane", "The company is headquartered in Dayton, Ohio.", "hq"],
  ["corvane", "Plans start at $35 per vehicle per month.", "starting_price_usd"],
  ["trakvia", "It was founded in 2012.", "founded"],
  ["gridwell", "Pricing starts at $45 per vehicle per month.", "starting_price_usd"],
];

interface Planned {
  brand: string;
  tone: Tone;
}

function toneFor(brand: string, promptId: string): Tone {
  const bias = REC_BIAS[brand] + (brand === "corvane" && (promptId === "P04" || promptId === "P09") ? 0.25 : 0);
  const r = rng();
  if (r < bias) return "recommended";
  if (r < bias + 0.35) return "neutral";
  if (r < bias + 0.5) return "negative";
  return brand === "gridwell" || brand === "routelyne" ? "not_recommended" : "neutral";
}

function plan(promptId: string): Planned[] {
  const brands = Object.keys(NAMES).filter((b) => (b === "corvane" ? chance(0.75) : chance(0.5)));
  const chosen = brands.length ? brands : ["corvane"];
  return chosen.sort(() => rng() - 0.5).slice(0, 4).map((brand) => ({ brand, tone: toneFor(brand, promptId) }));
}

interface Built {
  text: string;
  key: Record<string, [number, Tone]>;
  wrong: string[];
}

function build(engine: string, promptId: string, aud: string): Built {
  const items = plan(promptId);
  const wrong: string[] = [];
  const lines = items.map((it) => {
    let s = pick(PHRASES[it.tone])(pick(NAMES[it.brand]), aud, pick(DESC[it.brand]));
    const fact = FACTS.filter(([b]) => b === it.brand);
    if (fact.length && chance(0.35)) {
      const [, text, key] = pick(fact);
      s += ` ${text}`;
      if (key) wrong.push(`${it.brand}:${key}`);
    }
    return s;
  });
  const key = Object.fromEntries(items.map((it, i) => [it.brand, [i + 1, it.tone] as [number, Tone]]));
  const best = items.find((it) => it.tone === "recommended");
  const logistics = chance(0.08) ? "\nNot to be confused with Corvane Logistics, a freight brokerage based in Ohio." : "";
  if (engine === "Perplexity") {
    return { key, wrong, text: `Several providers are commonly recommended for ${aud}. [1]\n\n**Key options**\n${lines.map((l, i) => `- ${l} [${i + 2}]`).join("\n")}\n\nYour fleet size and compliance needs should drive the final choice.${logistics}` };
  }
  if (engine === "Google AI Overview") {
    return { key, wrong, text: `AI Overview\n${lines.map((l) => `- ${l}`).join("\n")}${logistics}` };
  }
  const bottom = best ? `\n\n**Bottom line:** for ${aud}, I'd start with ${pick(NAMES[best.brand])}.` : `\n\n**Bottom line:** shortlist two or three providers and ask each for a free trial before you commit.`;
  return { key, wrong, text: `Here are some strong options for ${aud}:\n\n${lines.join(" ")}${bottom}${logistics}` };
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const answers = wb.addWorksheet("Answers");
  answers.columns = [
    { header: "Response ID", key: "id", width: 18 },
    { header: "Week", key: "week", width: 6 },
    { header: "Engine", key: "engine", width: 20 },
    { header: "Question ID", key: "q", width: 12 },
    { header: "Run", key: "run", width: 6 },
    { header: "Collected", key: "collected", width: 20 },
    { header: "Answer", key: "answer", width: 100 },
    { header: "Sources", key: "sources", width: 60 },
    { header: "Error", key: "error", width: 10 },
  ];
  const keySheet = wb.addWorksheet("Answer key (for testing)");
  keySheet.columns = [
    { header: "response_id", key: "id", width: 18 },
    { header: "brand", key: "brand", width: 12 },
    { header: "position", key: "position", width: 10 },
    { header: "tone", key: "tone", width: 18 },
    { header: "wrong_facts", key: "wrong", width: 40 },
  ];

  let n = 0;
  for (const engine of ["ChatGPT", "Perplexity", "Google AI Overview"]) {
    for (const [promptId, aud] of PROMPTS) {
      for (const run of [1, 2]) {
        n++;
        const id = `r_w7_${String(n).padStart(3, "0")}`;
        const collected = new Date(Date.UTC(2026, 8, 28 + (n % 3), 8 + (n % 12), (n * 7) % 60));
        const qid = n % 5 === 0 ? promptId.toLowerCase() : promptId;
        if (n === 41) {
          answers.addRow({ id, week: `W${WEEK}`, engine, q: qid, run, collected, answer: "", sources: "", error: "timeout" });
          keySheet.addRow({ id, brand: "(collection failed)", position: "", tone: "", wrong: "" });
          continue;
        }
        const b = build(engine, promptId, aud);
        const sources = engine === "Google AI Overview" && chance(0.5) ? "" : SOURCES.filter(() => chance(0.3)).slice(0, 4).join("\n");
        answers.addRow({ id, week: `W${WEEK}`, engine, q: qid, run, collected, answer: b.text, sources, error: "" });
        for (const [brand, [position, tone]] of Object.entries(b.key)) {
          keySheet.addRow({ id, brand, position, tone, wrong: b.wrong.filter((w) => w.startsWith(brand)).map((w) => w.split(":")[1]).join(", ") });
        }
      }
    }
  }
  for (const ws of [answers, keySheet]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  answers.getColumn("answer").alignment = { wrapText: true, vertical: "top" };
  answers.getColumn("sources").alignment = { wrapText: true, vertical: "top" };
  answers.getColumn("collected").numFmt = "yyyy-mm-dd hh:mm";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await wb.xlsx.writeFile(OUT);
  process.stdout.write(`wrote ${OUT}: ${n} answers for week ${WEEK} (sheet 2 = answer key)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`make-sample-week failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
