const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginIdentifier =
  | { kind: "email"; canonical: string; phoneCandidates: [] }
  | { kind: "phone"; canonical: string; phoneCandidates: string[] };

export function normalizeLoginIdentifier(raw: string): LoginIdentifier | null {
  const value = raw.trim();
  if (!value || value.length > 320) return null;

  if (value.includes("@")) {
    const canonical = value.toLowerCase();
    return emailPattern.test(canonical)
      ? { kind: "email", canonical, phoneCandidates: [] }
      : null;
  }

  if (!/^[+()\-\.\s\d]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  const canonical = digits.length === 10 ? `1${digits}` : digits;
  const phoneCandidates = digits.length === 10
    ? [digits, canonical]
    : digits.length === 11 && digits.startsWith("1")
      ? [digits, digits.slice(1)]
      : [digits];

  return { kind: "phone", canonical, phoneCandidates: [...new Set(phoneCandidates)] };
}
