import { NextResponse } from "next/server";
import { getPublicEstimate } from "@/lib/service-ops/get-public-estimate";

function pdfEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildSimplePdf(lines: string[]) {
  const safeLines = lines.flatMap((line) => {
    if (line.length <= 88) return [line];
    const chunks: string[] = [];
    for (let index = 0; index < line.length; index += 88) chunks.push(line.slice(index, index + 88));
    return chunks;
  });

  const content = [
    "BT",
    "/F1 11 Tf",
    "50 760 Td",
    "14 TL",
    ...safeLines.map((line, index) => `${index === 0 ? "" : "T*"}(${pdfEscape(line)}) Tj`),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estimate = await getPublicEstimate(token);
  if (!estimate) return NextResponse.json({ ok: false, error: "Estimate not found." }, { status: 404 });

  const lines = [
    estimate.organizationName,
    "",
    `Estimate: ${estimate.title}`,
    `Customer: ${estimate.customerName}`,
    `Total: ${estimate.total}`,
    estimate.paymentTerms ? `Payment terms: ${estimate.paymentTerms}` : "",
    estimate.depositRequired !== "$0" ? `Deposit: ${estimate.depositRequired}` : "",
    "",
    "Scope of work",
    estimate.customerScopeSummary || "Scope details are being finalized.",
    "",
    estimate.customerExclusions ? `Not included unless approved: ${estimate.customerExclusions}` : "",
    estimate.customerNextSteps ? `Next steps: ${estimate.customerNextSteps}` : "",
    "",
    "Items",
    ...estimate.lineItems.map((item) => {
      const quantity = estimate.showQuantities ? ` / qty ${item.quantity}` : "";
      const price = estimate.showLineItemPrices ? ` / ${item.total}` : "";
      return `${item.name}${quantity}${price}`;
    })
  ].filter(Boolean);

  const pdf = buildSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="estimate-${estimate.estimateId}.pdf"`
    }
  });
}
