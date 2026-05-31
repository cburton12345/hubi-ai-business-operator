import Link from "next/link";
import { ExternalLink, FilePlus2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getHostedGrowthPages } from "@/lib/sites/hosted-growth-pages";
import { prepareHostedGrowthPagesAction, updateHostedGrowthPageAction } from "./actions";

export default async function HostedGrowthSitesPage() {
  const pages = await getHostedGrowthPages();
  const published = pages.filter((page) => page.status === "published").length;
  const connectedForms = pages.filter((page) => page.formPublicKey).length;

  return (
    <QueuePageShell
      eyebrow="Growth Sites"
      title="Hosted Landing Pages"
      description="Simple service and city pages hosted by Ferocity, connected to lead capture and attribution. This is not a generic website builder."
    >
      <div className="grid section-actions">
        <section className="panel span-4 metric">
          <span className="muted">Pages</span>
          <strong>{pages.length}</strong>
        </section>
        <section className="panel span-4 metric">
          <span className="muted">Published</span>
          <strong>{published}</strong>
        </section>
        <section className="panel span-4 metric">
          <span className="muted">Connected forms</span>
          <strong>{connectedForms}</strong>
        </section>
      </div>

      <div className="button-row section-actions">
        <form action={prepareHostedGrowthPagesAction}>
          <button className="button" type="submit">
            <FilePlus2 size={16} /> Prepare hosted pages
          </button>
        </form>
        <Link className="button secondary-button" href="/app/forms">
          Lead forms
        </Link>
        <Link className="button secondary-button" href="/app/growth">
          Growth loop
        </Link>
      </div>

      <ul className="list">
        {pages.map((page) => (
          <li className="list-row" key={page.id}>
            <div>
              <h3>{page.title}</h3>
              <p className="muted">
                {[page.brandName, page.pageType, page.primaryKeyword].filter(Boolean).join(" / ")}
              </p>
              <p className="muted">
                {page.formPublicKey ? `Lead form: ${page.formPublicKey}` : "Needs an active lead form before it can collect leads."}
              </p>
              <div className="button-row">
                {page.status === "published" ? (
                  <Link className="mini-button" href={page.publicUrl}>
                    <ExternalLink size={14} /> Open page
                  </Link>
                ) : (
                  <span className="pill">publish to enable public URL</span>
                )}
                <span className="pill">{page.trackingCode ?? "no tracking code"}</span>
              </div>
            </div>
            <form action={updateHostedGrowthPageAction} className="inline-actions approval-actions">
              <input name="pageId" type="hidden" value={page.id} />
              <select name="status" defaultValue={page.status}>
                <option value="planned">planned</option>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
              <label className="checkbox-row">
                <input name="noindex" type="checkbox" defaultChecked={page.noindex} />
                noindex
              </label>
              <button className="mini-button" type="submit">
                Save
              </button>
            </form>
          </li>
        ))}
        {pages.length === 0 ? (
          <li className="list-row">
            <div>
              <h3>No hosted pages prepared yet</h3>
              <p className="muted">Add real services, service areas, and a lead form, then prepare hosted pages.</p>
            </div>
          </li>
        ) : null}
      </ul>
    </QueuePageShell>
  );
}
