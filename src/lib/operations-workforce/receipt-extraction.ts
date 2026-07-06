function moneyToCents(value: string) {
  const number = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function extractReceiptFields(input: { vendor?: string | null; text?: string | null }) {
  const text = input.text ?? "";
  const amounts = Array.from(text.matchAll(/\$?\b(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)\b/g))
    .map((match) => moneyToCents(match[1]))
    .filter((amount) => amount > 0);
  const total = amounts.length > 0 ? Math.max(...amounts) : 0;

  return {
    vendor: input.vendor?.trim() || "Unknown vendor",
    totalCents: total,
    confidence: total > 0 ? 0.62 : 0.25,
    extractedText: text,
    fields: {
      possibleTotals: amounts.slice(0, 8),
      extractionMode: "local_text_first"
    }
  };
}
