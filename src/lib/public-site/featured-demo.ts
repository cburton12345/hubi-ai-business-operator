import { queryPostgres } from "@/lib/db/postgres";

export const publicCopyKeys = [
  "home_hero",
  "home_final_cta",
  "demo_hero",
  "pricing_hero",
] as const;
export type PublicCopyKey = (typeof publicCopyKeys)[number];

export type PublicCopySlot = {
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export const defaultPublicCopy: Record<PublicCopyKey, PublicCopySlot> = {
  home_hero: {
    eyebrow: "The AI operating system for running a business",
    headline: "Your business shouldn't stop when you stop looking at it.",
    body: "Give Ferocity the outcome. It finds what is blocking it, builds or improves what is missing, and carries authorized work from creating demand through delivery and collection. You handle the decisions that actually require you.",
    ctaLabel: "Give Ferocity an outcome",
    ctaHref: "#ask-ferocity",
    secondaryCtaLabel: "Watch Ferocity operate",
    secondaryCtaHref: "/demo",
  },
  home_final_cta: {
    eyebrow: "Your business. One operating system.",
    headline: "Set the goal. Keep control. Stop coordinating every next step.",
    body: "Ferocity can create and convert opportunities, coordinate delivery, keep collection moving, verify the result, and bring you only the decisions that need your judgment.",
    ctaLabel: "Put Ferocity to work",
    ctaHref: "/start",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing",
  },
  demo_hero: {
    eyebrow: "See the operating system in motion",
    headline: "Watch the whole business think and act as one.",
    body: "One opportunity moves through the people, departments, and connected systems responsible for it without losing context. Ferocity advances authorized work, verifies the result, and brings the owner a real decision only when one is needed.",
    ctaLabel: "Start Ferocity",
    ctaHref: "/start",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing",
  },
  pricing_hero: {
    eyebrow: "Start with the result",
    headline: "Put Ferocity to work before you commit to another subscription.",
    body: "Start with Ferocity Earn and pay a percentage only when eligible revenue is actually collected—or choose a complete monthly plan when you want more of the operating system working across the business every day.",
    ctaLabel: "Start with Ferocity Earn",
    ctaHref: "/start?source=pricing&plan=earn#start-request",
    secondaryCtaLabel: "Compare monthly plans",
    secondaryCtaHref: "#plans",
  },
};

export type FeaturedDemo = {
  enabled: boolean;
  sourceType: "direct_video" | "youtube" | "vimeo";
  mediaUrl: string;
  posterUrl: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

export const defaultFeaturedDemo: FeaturedDemo = {
  enabled: false,
  sourceType: "direct_video",
  mediaUrl: "",
  posterUrl: "",
  eyebrow: "Watch the operating system think",
  headline: "Watch work keep moving across the entire business.",
  body: "Ferocity connects leads, conversations, jobs, people, money, customer promises, and growth—then determines, performs, and follows through on the next authorized move.",
  ctaLabel: "Explore how Ferocity works",
  ctaHref: "/demo",
};

export async function getFeaturedDemo(): Promise<FeaturedDemo> {
  if (process.env.FEROCITY_PUBLIC_COPY_PREVIEW_DEFAULTS === "true")
    return defaultFeaturedDemo;

  const result = await queryPostgres<{
    enabled: boolean;
    source_type: FeaturedDemo["sourceType"];
    media_url: string | null;
    poster_url: string | null;
    eyebrow: string;
    headline: string;
    body: string;
    cta_label: string;
    cta_href: string;
  }>(
    `
    select enabled, source_type, media_url, poster_url, eyebrow, headline, body, cta_label, cta_href
    from public.platform_public_content
    where content_key = 'featured_demo'
    limit 1
    `,
  );
  const row = result?.rows[0];
  if (!row) return defaultFeaturedDemo;

  return {
    enabled: row.enabled && Boolean(row.media_url),
    sourceType: row.source_type,
    mediaUrl: row.media_url ?? "",
    posterUrl: row.poster_url ?? "",
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    ctaLabel: /full demo/i.test(row.cta_label)
      ? "Explore how Ferocity works"
      : row.cta_label,
    ctaHref: row.cta_href,
  };
}

export async function getPublicCopy(
  key: PublicCopyKey,
): Promise<PublicCopySlot> {
  const fallback = defaultPublicCopy[key];
  if (process.env.FEROCITY_PUBLIC_COPY_PREVIEW_DEFAULTS === "true")
    return fallback;

  const result = await queryPostgres<{
    enabled: boolean;
    updated_by: string | null;
    eyebrow: string;
    headline: string;
    body: string;
    cta_label: string;
    cta_href: string;
    secondary_cta_label: string | null;
    secondary_cta_href: string | null;
  }>(
    `
    select enabled, updated_by, eyebrow, headline, body, cta_label, cta_href, secondary_cta_label, secondary_cta_href
    from public.platform_public_content
    where content_key = $1
    limit 1
    `,
    [key],
  );
  const row = result?.rows[0];
  if (!row?.enabled) return fallback;
  const isSeededCopy =
    !row.updated_by || row.updated_by.startsWith("migration:");
  if (isSeededCopy) return fallback;
  return {
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    secondaryCtaLabel: row.secondary_cta_label ?? fallback.secondaryCtaLabel,
    secondaryCtaHref: row.secondary_cta_href ?? fallback.secondaryCtaHref,
  };
}

export type PublicCopyRevision = {
  id: string;
  stage: "draft" | "published" | "discarded";
  value: PublicCopySlot;
  changedBy: string | null;
  createdAt: string;
};

export type PublicCopyEditorState = {
  published: PublicCopySlot;
  draft: PublicCopyRevision | null;
  revisions: PublicCopyRevision[];
};

type PublicCopySnapshot = Partial<PublicCopySlot> & {
  stage?: unknown;
  eyebrow?: unknown;
  headline?: unknown;
  body?: unknown;
  cta_label?: unknown;
  cta_href?: unknown;
  secondary_cta_label?: unknown;
  secondary_cta_href?: unknown;
};

function snapshotString(snapshot: PublicCopySnapshot, camel: keyof PublicCopySlot, snake: keyof PublicCopySnapshot) {
  const value = snapshot[camel] ?? snapshot[snake];
  return typeof value === "string" ? value : "";
}

export function publicCopyFromSnapshot(snapshot: unknown, fallback: PublicCopySlot): PublicCopySlot {
  if (!snapshot || typeof snapshot !== "object") return fallback;
  const value = snapshot as PublicCopySnapshot;
  return {
    eyebrow: snapshotString(value, "eyebrow", "eyebrow") || fallback.eyebrow,
    headline: snapshotString(value, "headline", "headline") || fallback.headline,
    body: snapshotString(value, "body", "body") || fallback.body,
    ctaLabel: snapshotString(value, "ctaLabel", "cta_label") || fallback.ctaLabel,
    ctaHref: snapshotString(value, "ctaHref", "cta_href") || fallback.ctaHref,
    secondaryCtaLabel:
      snapshotString(value, "secondaryCtaLabel", "secondary_cta_label") || fallback.secondaryCtaLabel,
    secondaryCtaHref:
      snapshotString(value, "secondaryCtaHref", "secondary_cta_href") || fallback.secondaryCtaHref,
  };
}

function revisionStage(snapshot: unknown): PublicCopyRevision["stage"] {
  if (!snapshot || typeof snapshot !== "object") return "published";
  const stage = (snapshot as { stage?: unknown }).stage;
  return stage === "draft" || stage === "discarded" ? stage : "published";
}

export async function getPublicCopyEditorState(key: PublicCopyKey): Promise<PublicCopyEditorState> {
  const published = await getPublicCopy(key);
  const result = await queryPostgres<{
    id: string;
    snapshot_json: unknown;
    changed_by: string | null;
    created_at: string;
  }>(
    `
    select id, snapshot_json, changed_by, created_at
    from public.platform_public_content_versions
    where content_key = $1
    order by created_at desc
    limit 12
    `,
    [key],
  );
  const events = (result?.rows ?? []).map((row) => ({
    id: row.id,
    stage: revisionStage(row.snapshot_json),
    value: publicCopyFromSnapshot(row.snapshot_json, published),
    changedBy: row.changed_by,
    createdAt: row.created_at,
  }));
  const latestEvent = events[0] ?? null;

  return {
    published,
    draft: latestEvent?.stage === "draft" ? latestEvent : null,
    revisions: events.filter((event) => event.stage === "published").slice(0, 5),
  };
}

export function isSafePublicHref(value: string) {
  return (
    (/^\/(?!\/)/.test(value) || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) &&
    value.length <= 300
  );
}

export function normalizeDemoEmbedUrl(
  sourceType: FeaturedDemo["sourceType"],
  rawUrl: string,
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  if (sourceType === "direct_video") {
    return /\.(mp4|webm|mov)$/i.test(url.pathname) ? url.toString() : null;
  }

  if (sourceType === "youtube") {
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const id =
      hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : ["youtube.com", "youtube-nocookie.com"].includes(hostname)
          ? url.pathname.startsWith("/embed/")
            ? url.pathname.split("/")[2]
            : url.searchParams.get("v")
          : null;
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["vimeo.com", "player.vimeo.com"].includes(hostname)) return null;
  const id = url.pathname
    .split("/")
    .filter(Boolean)
    .find((part) => /^\d+$/.test(part));
  return id ? `https://player.vimeo.com/video/${id}` : null;
}
