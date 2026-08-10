const reservedDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "hubi.local",
  "localhost"
]);

export function isUsableProviderContactEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return false;
  const domain = email.slice(separator + 1);
  if (!domain.includes(".") || domain.endsWith(".local") || reservedDomains.has(domain)) return false;
  return !/\s/.test(email);
}
