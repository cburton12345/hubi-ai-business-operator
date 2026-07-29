export function createQuoteShortcutHref(input: { customerId?: string | null; backTo?: string | null } = {}) {
  const params = new URLSearchParams({ action: "create-estimate" });
  if (input.customerId) params.set("customerId", input.customerId);
  if (input.backTo?.startsWith("/app/")) params.set("backTo", input.backTo);
  return `/app/service?${params.toString()}#create-estimate`;
}
