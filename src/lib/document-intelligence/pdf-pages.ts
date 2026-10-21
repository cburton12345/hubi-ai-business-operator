export type PdfSourcePage = {
  pageNumber: number;
  text: string;
  kind: "text" | "image";
};

export type PdfSourceCoverage = {
  totalPages: number;
  attemptedPages: number[];
  readablePages: number[];
  failedPages: number[];
  omittedPages: number[];
};

let configurePdfRenderer: Promise<void> | null = null;

async function pdfTools() {
  const tools = await import("unpdf");
  configurePdfRenderer ??= tools.definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  await configurePdfRenderer;
  return tools;
}

export async function readPdfSource(bytes: Uint8Array, pageLimit = 25) {
  if (!bytes.byteLength) throw new Error("The PDF is empty.");
  const safeLimit = Math.max(1, Math.min(pageLimit, 100));
  const { extractText } = await pdfTools();
  const extracted = await extractText(Uint8Array.from(bytes), { mergePages: false });
  const attemptedCount = Math.min(extracted.totalPages, safeLimit);
  const pages: PdfSourcePage[] = extracted.text.slice(0, attemptedCount).map((text, index) => {
    const normalized = text.trim();
    return {
      pageNumber: index + 1,
      text: normalized,
      kind: normalized.length >= 60 ? "text" : "image",
    };
  });
  return {
    totalPages: extracted.totalPages,
    allExtractedText: extracted.text,
    pages,
    omittedPages: extracted.totalPages > attemptedCount
      ? Array.from({ length: extracted.totalPages - attemptedCount }, (_, index) => attemptedCount + index + 1)
      : [],
  };
}

export async function renderPdfPages(input: {
  bytes: Uint8Array;
  pageNumbers: number[];
  scale?: number;
}) {
  const { renderPageAsImage } = await pdfTools();
  const imageUrls: string[] = [];
  for (const pageNumber of input.pageNumbers) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error("PDF page numbers must be positive integers.");
    imageUrls.push(await renderPageAsImage(Uint8Array.from(input.bytes), pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: input.scale ?? 1.6,
      toDataURL: true,
    }));
  }
  return imageUrls;
}

export function groupPdfPages<T extends PdfSourcePage>(pages: T[], maximumGroupSize = 5) {
  const size = Math.max(1, Math.min(maximumGroupSize, 10));
  const groups: { kind: PdfSourcePage["kind"]; pages: T[] }[] = [];
  for (const page of pages) {
    const previous = groups.at(-1);
    if (previous && previous.kind === page.kind && previous.pages.length < size) previous.pages.push(page);
    else groups.push({ kind: page.kind, pages: [page] });
  }
  return groups;
}
