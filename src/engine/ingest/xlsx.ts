import ExcelJS from "exceljs";

/** Plain value of an Excel cell: rich text, hyperlinks, formulas and dates flattened to strings/numbers. */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== "object") return v;
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("hyperlink" in v) return typeof v.text === "string" ? v.text : v.hyperlink;
  if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
  if ("text" in v) return (v as { text: unknown }).text;
  return String(v);
}

/**
 * Reads the first worksheet of an .xlsx file (header row + one answer per row) and returns it as a JSON
 * array string, so it flows through the same normalisation as JSONL and CSV files.
 */
export async function xlsxToJson(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return "[]";
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).map((v) => String(cellValue(v) ?? "").trim());
  const rows: Array<Record<string, unknown>> = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const values = row.values as ExcelJS.CellValue[];
    const record: Record<string, unknown> = {};
    header.forEach((name, col) => {
      if (name) record[name] = cellValue(values[col]);
    });
    if (Object.values(record).some((x) => x !== null && x !== "")) rows.push(record);
  });
  return JSON.stringify(rows);
}

export const isXlsx = (name: string): boolean => /\.xlsx$/i.test(name);
