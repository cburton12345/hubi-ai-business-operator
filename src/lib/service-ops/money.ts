export function dollarsToCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").replace(/[$,]/g, "").trim();
  if (!raw) return 0;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return Math.round(parsed * 100);
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
