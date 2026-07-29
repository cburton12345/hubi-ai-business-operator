import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAuthorityBundleDetail, type AuthorityRow } from "@/lib/authority/get-authority-dashboard";

export default async function AuthorityBundlePage({ params }: { params: Promise<{ bundleId: string }> }) {
  const { bundleId } = await params;
  const bundle = await getAuthorityBundleDetail(bundleId);
  if (!bundle) notFound();

  return (
    <QueuePageShell
      eyebrow="Authority Bundle"
      title={bundle.title}
      description={`${bundle.customerName} / ${bundle.jobTitle}`}
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Review One Completed Job Bundle</h2>
            <p className="muted">{bundle.summary || "Ferocity prepared authority work from a real completed job."}</p>
          </div>
          <span className="pill">{bundle.status.replaceAll("_", " ")}</span>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/authority">Authority dashboard</Link>
          <Link className="button secondary-button" href="/app/review">Review queue</Link>
          <Link className="button secondary-button" href="/app/proof">Proof requests</Link>
          <Link className="button secondary-button" href="/app/publishing-hub">Publishing queue</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Panel title="Draft Assets" rows={bundle.drafts} empty="No drafts were found for this bundle." />
        <Panel title="Publishing Queue" rows={bundle.queueItems} empty="No publishing items were queued for this bundle." />
        <Panel title="Proof Requests" rows={bundle.proofRequests} empty="No proof request was found for this bundle." linkDetails copyDetails />
        <Panel title="Review Requests" rows={bundle.reviewRequests} empty="No review request was found for this bundle." actionHref="/app/review" actionLabel="Send when ready" />
        <Panel title="Project Knowledge" rows={bundle.knowledgeArticles} empty="No knowledge article was found for this bundle." />
      </section>
    </QueuePageShell>
  );
}

function Panel({
  title,
  rows,
  empty,
  linkDetails = false,
  copyDetails = false,
  actionHref,
  actionLabel
}: {
  title: string;
  rows: AuthorityRow[];
  empty: string;
  linkDetails?: boolean;
  copyDetails?: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="panel span-6">
      <div className="list-row flush-row">
        <h2>{title}</h2>
        {actionHref && actionLabel ? <Link className="mini-button" href={actionHref}>{actionLabel}</Link> : null}
      </div>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              {linkDetails && row.detail.startsWith("/") ? (
                <>
                  <Link className="inline-link" href={row.detail} target="_blank">Open {row.detail}</Link>
                  {copyDetails ? <input className="copy-field" readOnly value={row.detail} aria-label={`Copy ${row.title} link`} /> : null}
                </>
              ) : (
                <p className="muted">{row.detail}</p>
              )}
            </div>
            <span className="pill">{row.status.replaceAll("_", " ")}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
