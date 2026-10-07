import ExcelJS from "exceljs";
import type { AnalysisResult } from "../pipeline";
import { competitorOnlySources } from "../score/sources";

const MONTH_WEEKS = 4;
const pct = (x: number) => Math.round(x * 1000) / 10;
const one = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

function styleHeader(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A4D" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c) => {
    c.width = Math.min(60, Math.max(12, ...(c.values ?? []).map((v) => String(v ?? "").length + 2)));
  });
}

function addSheet(wb: ExcelJS.Workbook, name: string, header: string[], rows: unknown[][]): void {
  const ws = wb.addWorksheet(name);
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  styleHeader(ws);
}

export function buildBoardReport(result: AnalysisResult, perspective = result.perspective): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Corvane Signal";
  wb.created = new Date(result.generatedAt);
  const tracked = result.brands.filter((b) => b.tier !== "other");
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const latest = result.latestWeek;
  const monthWeeks = result.weeks.map((w) => w.week).slice(-MONTH_WEEKS);
  const monthResponses = result.responses.filter((r) => r.ok && monthWeeks.includes(r.week));

  addSheet(
    wb,
    "Summary",
    ["Company", `Score (week ${latest})`, "Change vs previous week", "Is the change real?", "Mentioned in % of answers", "Recommended in % of answers", "Average position", "Wrong facts (all weeks)"],
    tracked.map((b) => {
      const bw = result.brandWeeks.find((x) => x.brand === b.key && x.week === latest);
      const cmp = result.comparisons.find((c) => c.brand === b.key && c.week === latest);
      return [
        b.name,
        one(bw?.score),
        one(cmp?.delta),
        cmp ? { real_gain: "Yes: a real rise", real_drop: "Yes: a real fall", normal_variation: "No: within normal ups and downs", no_baseline: "No earlier week to compare" }[cmp.movement] : "",
        pct(bw?.mentionRate ?? 0),
        pct(bw?.recommendRate ?? 0),
        one(bw?.avgPosition),
        result.wrongFacts.filter((f) => f.brand === b.key).length,
      ];
    }),
  );

  addSheet(
    wb,
    "Weekly trend",
    ["Week", "Partial week?", "Engines collected", ...tracked.map((b) => `${b.name} score`)],
    result.weeks.map((w) => [
      w.week,
      w.partial ? `Yes (missing ${w.missingEngines.join(", ") || "questions"})` : "No",
      w.engines.join(", "),
      ...tracked.map((b) => one(result.brandWeeks.find((x) => x.brand === b.key && x.week === w.week)?.score)),
    ]),
  );

  addSheet(
    wb,
    "Questions (last 4 weeks)",
    ["Question", "Stage", "Priority", ...tracked.flatMap((b) => [`${b.name} mentioned %`, `${b.name} recommended %`])],
    result.prompts.map((p) => {
      const rs = monthResponses.filter((r) => r.promptId === p.id);
      return [
        p.question,
        p.stage.replace(/_/g, " "),
        p.priority,
        ...tracked.flatMap((b) => {
          const ms = rs.map((r) => r.mentions.find((m) => m.brand === b.key)!);
          return [pct(rs.length ? ms.filter((m) => m.mentioned).length / rs.length : 0), pct(rs.length ? ms.filter((m) => m.tone === "recommended").length / rs.length : 0)];
        }),
      ];
    }),
  );

  addSheet(
    wb,
    "Engines (last 4 weeks)",
    ["Engine", ...tracked.map((b) => `${b.name} mentioned %`)],
    [...new Set(monthResponses.map((r) => r.engine))].map((e) => {
      const rs = monthResponses.filter((r) => r.engine === e);
      return [result.engines.find((x) => x.canonical === e)?.label ?? e, ...tracked.map((b) => pct(rs.filter((r) => r.mentions.find((m) => m.brand === b.key)?.mentioned).length / (rs.length || 1)))];
    }),
  );

  const byId = new Map(result.responses.map((r) => [r.responseId, r]));
  const question = new Map(result.prompts.map((p) => [p.id, p.question]));
  addSheet(
    wb,
    "Wrong facts",
    ["Week", "Engine", "Question", "Company", "Fact", "What the AI said", "What is true", "Response ID"],
    result.wrongFacts.map((f) => {
      const r = byId.get(f.responseId);
      return [r?.week, r?.engine, question.get(r?.promptId ?? "") ?? r?.promptId, name(f.brand), f.factKey, f.claimText, f.expectedValue, f.responseId];
    }),
  );

  const competitors = tracked.filter((b) => b.key !== perspective).map((b) => b.key);
  const gaps = new Set(competitorOnlySources(result.sources, perspective, competitors).map((s) => s.domain));
  addSheet(
    wb,
    "Sources",
    ["Website", "Type", "Answers citing it", ...tracked.map((b) => `Answers naming ${b.name}`), `Cites competitors but never ${name(perspective)}`],
    result.sources.slice(0, 40).map((s) => [s.domain, s.kind.replace(/_/g, " "), s.answers, ...tracked.map((b) => s.brandAnswers[b.key] ?? 0), gaps.has(s.domain) ? "Yes" : ""]),
  );

  addSheet(
    wb,
    "Data notes",
    ["Note"],
    [
      [`Generated ${result.generatedAt} from ${result.files.join(", ")}`],
      [`Score = priority-weighted average points per answer (recommended 100, neutral 50, negative 25, not recommended/absent 0; x1.0/x0.85/x0.7 for 1st/2nd/3rd+ named).`],
      [`Week-on-week change compares only question/engine pairs collected in both weeks; it is "real" when larger than 95% of changes produced by shuffling runs.`],
      ...result.weeks.filter((w) => w.partial).map((w) => [`Week ${w.week} is partial: missing ${w.missingEngines.join(", ") || "some questions"} (coverage ${pct(w.coverage)}%).`]),
      [`${result.issues.length} data issues were handled automatically (duplicates, timeouts, format variants); see the Data page.`],
    ],
  );
  return wb;
}

export async function writeBoardReport(result: AnalysisResult, file: string): Promise<void> {
  await buildBoardReport(result).xlsx.writeFile(file);
}

export async function boardReportBuffer(result: AnalysisResult, perspective?: string): Promise<Buffer> {
  return Buffer.from(await buildBoardReport(result, perspective).xlsx.writeBuffer());
}
