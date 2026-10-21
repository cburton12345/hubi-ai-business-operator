import crypto from "node:crypto";

export function rotatingSecretCandidates(...values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function hasRotatingSecret(...values: Array<string | null | undefined>) {
  return rotatingSecretCandidates(...values).length > 0;
}

export function timingSafeSecretMatch(
  candidate: string | null | undefined,
  ...expectedValues: Array<string | null | undefined>
) {
  const normalizedCandidate = candidate?.trim();
  const expected = rotatingSecretCandidates(...expectedValues);
  if (!normalizedCandidate || expected.length === 0) return false;

  const candidateDigest = crypto.createHash("sha256").update(normalizedCandidate).digest();
  let matched = false;
  for (const value of expected) {
    const expectedDigest = crypto.createHash("sha256").update(value).digest();
    matched = crypto.timingSafeEqual(candidateDigest, expectedDigest) || matched;
  }
  return matched;
}
