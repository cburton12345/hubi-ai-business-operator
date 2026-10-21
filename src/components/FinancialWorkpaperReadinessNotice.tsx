import type { FinancialWorkpaperReadiness } from "@/lib/document-intelligence/financial-workpaper-readiness";

export function FinancialWorkpaperReadinessNotice({ readiness }: { readiness: FinancialWorkpaperReadiness }) {
  if (readiness.status === "ready_for_preparer") {
    return <section className="tax-print-readiness tax-print-readiness-ready">
      <h2>{readiness.label}</h2>
      <p>{readiness.summary}</p>
    </section>;
  }
  return <section className="tax-print-warning">
    <h2>{readiness.label}</h2>
    <p>{readiness.summary}</p>
    {readiness.nextAction ? <p><strong>Next:</strong> {readiness.nextAction}</p> : null}
    {readiness.blocks.length ? <ul>
      {readiness.blocks.map((block) => <li key={block.code}>{block.message}</li>)}
    </ul> : null}
  </section>;
}
