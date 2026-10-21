const structuredExtensions = new Set(["csv", "tsv", "txt", "xml", "ofx", "qfx", "qbo", "xlsx"]);

export function structuredExtension(fileName?: string | null) {
  const extension = fileName?.split(".").pop()?.trim().toLowerCase() ?? "";
  return structuredExtensions.has(extension) ? extension : null;
}

function printableCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).replaceAll(/[\t\r\n]+/g, " ").trim();
}

export async function extractStructuredFileText(input: { fileName?: string | null; bytes: Uint8Array }) {
  const extension = structuredExtension(input.fileName);
  if (!extension) return null;
  if (extension === "xlsx") {
    const { default: readXlsxFile, readSheetNames } = await import("read-excel-file/node");
    const buffer = Buffer.from(input.bytes);
    const sheetNames = await readSheetNames(buffer);
    const sections: string[] = [];
    let remainingRows = 501;
    for (const sheet of sheetNames.slice(0, 20)) {
      if (remainingRows <= 0) break;
      const rows = await readXlsxFile(buffer, { sheet });
      const selected = rows.slice(0, remainingRows);
      remainingRows -= selected.length;
      sections.push(`--- SHEET: ${sheet} ---\n${selected.map((row) => row.map(printableCell).join("\t")).join("\n")}`);
    }
    return sections.join("\n\n").slice(0, 500_000);
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes).replace(/^\uFEFF/, "");
  if (!decoded.trim()) throw new Error("The structured file is empty or could not be decoded as UTF-8.");
  return decoded.slice(0, 500_000);
}
