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
    headline: "Imagine hiring an entire AI operations department—all sharing the same Business Brain.",
    body: "They answer phones, follow up with leads, prepare estimates, coordinate jobs, dispatch crews, manage customer communication, collect payments, keep marketing moving, monitor operations, and only bring you the decisions that actually require human judgment. And that’s just the beginning. That’s Ferocity.",
    ctaLabel: "See how Ferocity works",
    ctaHref: "/demo",
    secondaryCtaLabel: "See plans & pricing",
    secondaryCtaHref: "/pricing"
  },
  home_final_cta: {
    eyebrow: "One Business Brain for the entire company",
    headline: "Give the whole organization one system for what happens next.",
    body: "Start with one department or connect the full operating loop. Ferocity learns the business, coordinates human and AI work, remembers the rules, and keeps unfinished work moving until it is complete or needs a real decision.",
    ctaLabel: "Start Ferocity",
    ctaHref: "/subscribe",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing"
  },
  demo_hero: {
    eyebrow: "See Ferocity think",
    headline: "Watch the whole business think and act as one.",
    body: "One opportunity moves through people, AI employees, departments, and providers without losing its context. Ferocity decides what should happen next, advances authorized work, verifies the result, and keeps going until a real decision is needed.",
    ctaLabel: "Start Ferocity",
    ctaHref: "/subscribe",
    secondaryCtaLabel: "Compare plans",
    secondaryCtaHref: "/pricing"
  },
  pricing_hero: {
    eyebrow: "Simple paid plans",
    headline: "Choose how much work you want taken off your plate.",
    body: "Every plan includes Ferocity’s real AI engine. Higher tiers handle more of the customer journey, connect more of the business, and watch for more problems before they cost you.",
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
    eyebrow: string;
    headline: string;
    body: string;
    cta_label: string;
    cta_href: string;
    secondary_cta_label: string | null;
    secondary_cta_href: string | null;
  }>(
    `
    select enabled, eyebrow, headline, body, cta_label, cta_href, secondary_cta_label, secondary_cta_href
    from public.platform_public_content
    where content_key = $1
    limit 1
    `,
    [key]
  );
  const row = result?.rows[0];
  if (!row?.enabled) return fallback;
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
