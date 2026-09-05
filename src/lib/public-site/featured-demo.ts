import { queryPostgres } from "@/lib/db/postgres";

export const publicCopyKeys = ["home_hero", "home_final_cta", "demo_hero", "pricing_hero"] as const;
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
    eyebrow: "Meet your AI operations department",
    headline: "Your business shouldn't stop when you stop looking at it.",
    body: "Ferocity gives your people and AI workforce one shared Business Brain. It notices what changed, understands what it affects, and keeps the next authorized step moving across sales, operations, field work, finance, customer care, and growth. Only a real decision comes back to you.",
    ctaLabel: "See Ferocity run a business",
    ctaHref: "/demo",
    secondaryCtaLabel: "See plans & pricing",
    secondaryCtaHref: "/pricing"
  },
  home_final_cta: {
    eyebrow: "Build without becoming the bottleneck",
    headline: "Build the business without making yourself the bottleneck.",
    body: "More customers shouldn't mean more things for you to chase. More employees shouldn't mean more things for you to coordinate. More work shouldn't mean more things for you to remember. More software shouldn't mean more dashboards for you to watch. Your business keeps moving—even when you're not watching it.",
    ctaLabel: "Start Ferocity",
    ctaHref: "/start",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing"
  },
  demo_hero: {
    eyebrow: "See the operating system in motion",
    headline: "Watch the whole business think and act as one.",
    body: "One opportunity moves through people, AI employees, departments, and providers without losing its context. Ferocity decides what should happen next, advances authorized work, verifies the result, and keeps going until a real decision is needed.",
    ctaLabel: "Start Ferocity",
    ctaHref: "/start",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing"
  },
  pricing_hero: {
    eyebrow: "Simple paid plans",
    headline: "Choose how much of the business you want Ferocity to run.",
    body: "Every complete plan uses the same Business Brain. Higher tiers give it more specialized departments, connected execution, and authority to keep more of the business moving proactively.",
    ctaLabel: "Start Growth",
    ctaHref: "/subscribe?plan=growth",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "#plans"
  }
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
  ctaLabel: "Open full demo",
  ctaHref: "/demo"
};

export async function getFeaturedDemo(): Promise<FeaturedDemo> {
  if (process.env.FEROCITY_PUBLIC_COPY_PREVIEW_DEFAULTS === "true") return defaultFeaturedDemo;

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
    `
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
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href
  };
}

export async function getPublicCopy(key: PublicCopyKey): Promise<PublicCopySlot> {
  const fallback = defaultPublicCopy[key];
  if (process.env.FEROCITY_PUBLIC_COPY_PREVIEW_DEFAULTS === "true") return fallback;

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
    [key]
  );
  const row = result?.rows[0];
  if (!row?.enabled) return fallback;
  const isSeededCopy = !row.updated_by || row.updated_by.startsWith("migration:");
  if (isSeededCopy) return fallback;
  return {
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    secondaryCtaLabel: row.secondary_cta_label ?? fallback.secondaryCtaLabel,
    secondaryCtaHref: row.secondary_cta_href ?? fallback.secondaryCtaHref
  };
}

export function isSafePublicHref(value: string) {
  return (/^\/(?!\/)/.test(value) || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) && value.length <= 300;
}

export function normalizeDemoEmbedUrl(sourceType: FeaturedDemo["sourceType"], rawUrl: string) {
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
    const id = hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : ["youtube.com", "youtube-nocookie.com"].includes(hostname)
        ? (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : url.searchParams.get("v"))
        : null;
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["vimeo.com", "player.vimeo.com"].includes(hostname)) return null;
  const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
  return id ? `https://player.vimeo.com/video/${id}` : null;
}
