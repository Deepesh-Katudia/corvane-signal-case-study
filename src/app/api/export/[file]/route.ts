import { NextResponse } from "next/server";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { mentionsCsv, wrongFactsCsv } from "@/engine/export/scoringCsv";
import { boardReportBuffer } from "@/engine/export/boardReport";

const FILES = {
  "mentions.csv": "text/csv; charset=utf-8",
  "wrong_facts.csv": "text/csv; charset=utf-8",
  "board_report.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

type ExportName = keyof typeof FILES;

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!(file in FILES)) return NextResponse.json({ error: `Unknown export "${file}"` }, { status: 404 });
  const name = file as ExportName;
  const { result, config } = await getAnalysis();
  const focus = resolvePerspective(result, new URL(req.url).searchParams.get("as") ?? undefined);
  const body =
    name === "mentions.csv"
      ? mentionsCsv(result.responses)
      : name === "wrong_facts.csv"
        ? wrongFactsCsv(result.responses, config.brands)
        : new Uint8Array(await boardReportBuffer(result, focus));
  return new NextResponse(body, {
    headers: {
      "Content-Type": FILES[name],
      "Content-Disposition": `attachment; filename="${name === "board_report.xlsx" && focus !== result.perspective ? `board_report_${focus}.xlsx` : name}"`,
      "Cache-Control": "no-store",
    },
  });
}
