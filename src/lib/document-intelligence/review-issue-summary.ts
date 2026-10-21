export function summarizeDocumentReviewIssues(issues: string[]) {
  const unique = [...new Set(issues.map((issue) => issue.trim()).filter(Boolean))];
  const transactionMismatches = unique.filter((issue) => /^statement transaction \d+ differs between reviews\.?$/i.test(issue));
  const other = unique.filter((issue) => !/^statement transaction \d+ differs between reviews\.?$/i.test(issue));
  const summary = other.slice(0, 4);
  if (transactionMismatches.length) {
    summary.push(`${transactionMismatches.length} statement transaction${transactionMismatches.length === 1 ? "" : "s"} differed between the first and second reading.`);
  }
  if (other.length > 4) summary.push(`${other.length - 4} additional review issue${other.length - 4 === 1 ? " is" : "s are"} retained in the audit record.`);
  return summary;
}
