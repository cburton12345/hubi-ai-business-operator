function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  return trimmed.replace(/\D/g, "");
}

export function manualSmsHref(phone: string | null | undefined, body: string) {
  const normalized = normalizePhone(phone);
  return `sms:${normalized}?body=${encodeURIComponent(body)}`;
}
