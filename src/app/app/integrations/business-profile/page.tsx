import Link from "next/link";
import { MapPin, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { discoverBusinessProfileLocationsAction, selectBusinessProfileLocationAction, syncBusinessProfileReviewsAction } from "./actions";

export default async function BusinessProfileIntegrationPage({ searchParams }: { searchParams: Promise<{ locations?: string; reviews?: string }> }) {
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const connection = await queryPostgres<{ id: string; status: string; metadata_json: { reviewSyncAt?: string } | null }>(
    "select id,status,metadata_json from public.integration_connections where tenant_id=$1 and provider='google_business_profile' limit 1", [tenantId]
  );
  const locations = await queryPostgres<{ id: string; title: string; address_text: string | null; primary_category: string | null; verification_state: string | null; selected: boolean }>(
    "select id,title,address_text,primary_category,verification_state,selected from public.business_profile_locations where tenant_id=$1 order by selected desc,title", [tenantId]
  );
  const reviews = await queryPostgres<{ id: string; reviewer_name: string | null; star_rating: number | null; comment_text: string | null; review_created_at: string | null; reply_comment: string | null }>(
    "select id,reviewer_name,star_rating,comment_text,review_created_at,reply_comment from public.business_profile_reviews where tenant_id=$1 order by review_created_at desc nulls last limit 25", [tenantId]
  );
  const connected = connection?.rows[0]?.status === "connected";
  return <QueuePageShell eyebrow="Reputation" title="Google Business Profile" description="Monitor the location customers already see on Google. Ferocity reads locations and reviews first; public replies and profile changes remain approval-gated.">
    <div className="button-row section-actions"><Link className="button secondary-button" href="/app/integrations">All integrations</Link><Link className="button secondary-button" href="/app/review">Review requests</Link></div>
    {params.locations ? <section className="panel"><strong>Found {params.locations} business location(s).</strong></section> : null}
    {params.reviews ? <section className="panel"><strong>Review sync complete.</strong><p className="muted">Refreshed {params.reviews} review(s) without posting or replying.</p></section> : null}
    <section className="panel form-stack">
      <div className="list-row flush-row"><div><h2><MapPin size={18} /> Business location</h2><p className="muted">Choose the location Ferocity should monitor.</p></div><span className="pill">{connected ? "Connected" : "Not connected"}</span></div>
      {!connected ? <Link className="button" href="/api/integrations/google_business_profile/oauth/start">Connect Google Business Profile</Link> : <>
        <form action={discoverBusinessProfileLocationsAction}><button className="mini-button" type="submit"><RefreshCw size={14} /> Find my locations</button></form>
        {(locations?.rows ?? []).map((location) => <form action={selectBusinessProfileLocationAction} className="list-row" key={location.id}>
          <input name="locationId" type="hidden" value={location.id} /><div><strong>{location.title}</strong><p className="muted">{[location.primary_category, location.address_text].filter(Boolean).join(" · ")}</p></div>
          {location.selected ? <span className="pill low">Selected</span> : <button className="mini-button" type="submit">Use this location</button>}
        </form>)}
        {(locations?.rows ?? []).some((location) => location.selected) ? <form action={syncBusinessProfileReviewsAction}><button className="button" type="submit">Refresh reviews</button></form> : null}
        <p className="muted"><ShieldCheck size={14} /> This connection is read-only here. Replies and profile edits require a separate reviewed action.</p>
      </>}
    </section>
    {(reviews?.rows ?? []).length ? <section className="panel form-stack"><h2><Star size={18} /> Recent reviews</h2>{reviews?.rows.map((review) => <article className="list-row" key={review.id}><div><strong>{review.reviewer_name || "Google customer"} · {review.star_rating ?? "—"}/5</strong><p>{review.comment_text || "No written comment"}</p>{review.reply_comment ? <p className="muted">Reply on Google: {review.reply_comment}</p> : <p className="muted">No public reply recorded.</p>}</div></article>)}</section> : null}
  </QueuePageShell>;
}
