/**
 * A small CSV reader and writer for the stock spreadsheet: commas, quoted fields (with "" for a
 * quote and line breaks inside), Windows or Unix line endings, and the byte-order mark Excel adds.
 * Pure, so it is tested on its own.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // rows a spreadsheet leaves at the end with nothing in them
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** One cell as CSV: quoted when it holds a comma, quote or line break; a leading = + - @ can't run as a formula. */
function cell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text) && typeof value !== "number") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** The columns the shop's stock sheet uses, and the other names people give them. */
const COLUMNS = {
  sku: ["sku", "code", "item code"],
  count: ["count", "counted", "new count", "stock count", "set to"],
  change: ["change", "add", "adjust", "adjustment", "+/-"],
  reason: ["reason", "note", "notes"],
} as const;
export type Column = keyof typeof COLUMNS;

/** Which position each known column has in the header row; unknown columns are ignored. */
export function headerPositions(header: string[]) {
  const names = header.map((name) => name.trim().toLowerCase().replace(/_/g, " "));
  const found: Partial<Record<Column, number>> = {};
  for (const [column, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    const index = names.findIndex((name) => aliases.includes(name));
    if (index >= 0) found[column] = index;
  }
  return found;
}
