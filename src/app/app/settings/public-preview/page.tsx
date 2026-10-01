import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  getPublicCopyEditorState,
  publicCopyKeys,
  type PublicCopyKey,
  type PublicCopySlot,
} from "@/lib/public-site/featured-demo";

function isPublicCopyKey(value: string | undefined): value is PublicCopyKey {
  return Boolean(value && publicCopyKeys.includes(value as PublicCopyKey));
}

function CopyPreview({ contentKey, value }: { contentKey: PublicCopyKey; value: PublicCopySlot }) {
  if (contentKey === "home_hero") {
    return (
      <section className="hero-command">
        <div className="hero-copy">
          <p className="eyebrow">{value.eyebrow}</p>
          <h1>{value.headline}</h1>
          <p className="hero-deck">{value.body}</p>
          <div className="button-row">
            <span className="button">{value.ctaLabel} <ArrowRight size={16} /></span>
            <span className="button secondary-button">{value.secondaryCtaLabel}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={contentKey === "home_final_cta" ? "final-cta" : "panel feature-split"}>
      <div>
        <p className="eyebrow">{value.eyebrow}</p>
        <h2>{value.headline}</h2>
        <p className="muted">{value.body}</p>
      </div>
      <div className="button-row">
        <span className="button">{value.ctaLabel}</span>
        <span className="button secondary-button">{value.secondaryCtaLabel}</span>
      </div>
    </section>
  );
}

export default async function PublicCopyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  await requirePermission("platform:manage");
  const query = await searchParams;
  const contentKey = isPublicCopyKey(query.slot) ? query.slot : "home_hero";
  const state = await getPublicCopyEditorState(contentKey);
  const value = state.draft?.value ?? state.published;

  return (
    <QueuePageShell
      eyebrow="Private preview"
      title={state.draft ? "Review the unpublished wording" : "Published wording"}
      description={state.draft
        ? "Only platform administrators can see this preview. Publishing remains a separate explicit action."
        : "There is no active draft for this content slot."}
    >
      <div className="button-row">
        <Link className="button secondary-button" href={`/app/settings?slot=${contentKey}`}>Back to editor</Link>
      </div>
      <div className="public-page public-copy-preview">
        <section className="public-shell">
          <CopyPreview contentKey={contentKey} value={value} />
        </section>
      </div>
      <section className="panel">
        <p className="eyebrow">Destinations</p>
        <p><strong>Primary:</strong> {value.ctaHref}</p>
        <p><strong>Secondary:</strong> {value.secondaryCtaHref}</p>
      </section>
    </QueuePageShell>
  );
}
