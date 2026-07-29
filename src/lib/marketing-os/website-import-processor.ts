import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";

type WebsiteImportRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  website_url: string;
};

export type WebsiteImportProcessResult = {
  ok: boolean;
  importId?: string;
  profileId?: string | null;
  message: string;
  extracted?: {
    title: string | null;
    metaDescription: string | null;
    headings: string[];
    phones: string[];
    emails: string[];
    serviceHints: string[];
    serviceAreaHints: string[];
    internalLinks: Array<{ text: string; href: string }>;
  };
};

export type PublicWebsiteAnalysis = NonNullable<WebsiteImportProcessResult["extracted"]> & {
  finalUrl: string;
  contentType: string;
  htmlCharsRead: number;
  formCount: number;
  ctaHints: string[];
  trustHints: string[];
  mediaHints: string[];
};

const PRIVATE_IPV4_PATTERNS = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
];

function safeUrl(input: string) {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return null;
    if (hostname === "::1" || hostname === "[::1]") return null;
    if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  return false;
}

async function assertPublicDestination(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private network destinations are blocked.");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private network destinations are blocked.");
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_match, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : "";
    });
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/\s+/g, " ").trim());
}

function stripTags(value: string) {
  return cleanText(value.replace(/<[^>]*>/g, " "));
}

function unique(values: string[], limit = 20) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map(cleanText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function extractTag(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripTags(match[1]) : null;
}

function extractMetaDescription(html: string) {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
  return match ? cleanText(match[1]) : null;
}

function extractHeadings(html: string) {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    headings.push(stripTags(match[1]));
  }
  return unique(headings, 24);
}

function extractLinks(html: string, baseUrl: URL) {
  const links: Array<{ text: string; href: string }> = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripTags(match[2]);
    if (!text || text.length > 100) continue;
    try {
      const href = new URL(decodeEntities(match[1]), baseUrl);
      if (href.hostname !== baseUrl.hostname) continue;
      links.push({ text, href: href.toString() });
    } catch {
      continue;
    }
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.text.toLowerCase()}|${link.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
}

function extractEmails(text: string) {
  return unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [], 10);
}

function extractPhones(text: string) {
  return unique(text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) ?? [], 10);
}

function serviceHints(headings: string[], links: Array<{ text: string }>) {
  const terms = [
    "roof",
    "storm",
    "hail",
    "repair",
    "replacement",
    "remodel",
    "landscaping",
    "cleaning",
    "hvac",
    "plumbing",
    "electrical",
    "service",
    "installation",
    "inspection",
    "maintenance",
    "rental"
  ];
  const candidates = [...headings, ...links.map((link) => link.text)].filter((value) => {
    const lower = value.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
  return unique(candidates, 12);
}

function areaHints(text: string, links: Array<{ text: string }>) {
  const candidates = [
    ...(text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2},\s?(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/g) ?? []),
    ...links.map((link) => link.text).filter((text) => /\b(service areas?|locations?|near me|areas served)\b/i.test(text))
  ];
  return unique(candidates, 12);
}

function extractCtaHints(text: string, links: Array<{ text: string }>) {
  const patterns = [
    "free estimate",
    "get a quote",
    "request a quote",
    "schedule",
    "book",
    "call now",
    "contact us",
    "request service",
    "get started"
  ];
  const candidates = [...links.map((link) => link.text), text.slice(0, 12000)].filter((value) => {
    const lower = value.toLowerCase();
    return patterns.some((pattern) => lower.includes(pattern));
  });
  return unique(candidates, 12);
}

function extractTrustHints(text: string) {
  const patterns = [
    "review",
    "testimonial",
    "before and after",
    "before & after",
    "licensed",
    "insured",
    "warranty",
    "guarantee",
    "family owned",
    "locally owned"
  ];
  return unique(
    patterns.filter((pattern) => text.toLowerCase().includes(pattern)).map((pattern) => pattern.replace(/\b\w/g, (char) => char.toUpperCase())),
    12
  );
}

function extractMediaHints(html: string) {
  const imageCount = (html.match(/<img\b/gi) ?? []).length;
  const videoCount = (html.match(/<video\b|youtube\.com|vimeo\.com/gi) ?? []).length;
  const hints: string[] = [];
  if (imageCount > 0) hints.push(`${imageCount} image${imageCount === 1 ? "" : "s"}`);
  if (videoCount > 0) hints.push(`${videoCount} video hint${videoCount === 1 ? "" : "s"}`);
  return hints;
}

export async function analyzePublicWebsiteUrl(websiteUrl: string): Promise<
  | { ok: true; analysis: PublicWebsiteAnalysis }
  | { ok: false; message: string }
> {
  const url = safeUrl(websiteUrl);
  if (!url) {
    return { ok: false, message: "Use a public http or https website URL. Local and private network URLs are blocked." };
  }

  try {
    const { html, finalUrl, contentType } = await fetchPublicHtml(url);
    const text = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
    const title = extractTag(html, "title");
    const metaDescription = extractMetaDescription(html);
    const headings = extractHeadings(html);
    const links = extractLinks(html, new URL(finalUrl));
    const formCount = (html.match(/<form\b/gi) ?? []).length;
    return {
      ok: true,
      analysis: {
        finalUrl,
        contentType,
        htmlCharsRead: html.length,
        title,
        metaDescription,
        headings,
        phones: extractPhones(text),
        emails: extractEmails(text),
        serviceHints: serviceHints(headings, links),
        serviceAreaHints: areaHints(text, links),
        internalLinks: links,
        formCount,
        ctaHints: extractCtaHints(text, links),
        trustHints: extractTrustHints(text),
        mediaHints: extractMediaHints(html)
      }
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Website scan failed." };
  }
}

async function fetchPublicHtml(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let currentUrl = url;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      await assertPublicDestination(currentUrl);
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "FerocityWebsiteImport/1.0 (+https://ferocity.live)"
        }
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 5) throw new Error("Website redirected too many times.");
      const redirected = safeUrl(new URL(location, currentUrl).toString());
      if (!redirected) throw new Error("Website redirected to a blocked destination.");
      currentUrl = redirected;
    }

    if (!response) throw new Error("Website did not return a response.");

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      throw new Error(`Website returned ${response.status}.`);
    }
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML.");
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      throw new Error("Website response is too large to import safely.");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Website returned an empty response.");
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 300000) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    await reader.cancel();
    html = html.slice(0, 300000);
    return { html, finalUrl: currentUrl.toString(), contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function markImportFailed(workspaceId: string, importId: string, message: string) {
  await queryPostgres(
    `
    update public.marketing_os_website_imports
    set status = 'failed',
        error_message = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, importId, message, JSON.stringify({ processedBy: "safe_html_import_v1", failedAt: new Date().toISOString() })]
  );
}

async function logWebsiteImport(workspaceId: string, title: string, body: string, metadata: Record<string, unknown>) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'marketing', 'website_import', $2, $3, $4::jsonb)
    `,
    [workspaceId, title, body, JSON.stringify(metadata)]
  );
}

async function upsertReviewProfile(workspaceId: string, row: WebsiteImportRow, extraction: WebsiteImportProcessResult["extracted"]) {
  if (!extraction) return null;

  const insertResult = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_os_business_profiles (
      tenant_id, brand_id, company_name, website_url, primary_phone, primary_email, brand_voice,
      ideal_customers, services_json, service_areas_json, social_links_json, faqs_json, offers_json,
      reviews_json, uploaded_assets_json, imported_from_url, source, status, last_refreshed_at, metadata_json
    )
    values (
      $1, $2, $3, $4, $5, $6, 'Use clear, useful, local-service language.',
      $7, $8::jsonb, $9::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, $4, 'website_import', 'needs_review', now(), $10::jsonb
    )
    on conflict do nothing
    returning id
    `,
    [
      workspaceId,
      row.brand_id,
      extraction.title,
      row.website_url,
      extraction.phones[0] ?? null,
      extraction.emails[0] ?? null,
      extraction.metaDescription,
      JSON.stringify(extraction.serviceHints.map((name) => ({ name, source: "website_import", needsReview: true }))),
      JSON.stringify(extraction.serviceAreaHints.map((name) => ({ name, source: "website_import", needsReview: true }))),
      JSON.stringify({
        source: "safe_html_import_v1",
        importId: row.id,
        reviewBeforeUse: true,
        title: extraction.title,
        headings: extraction.headings.slice(0, 8)
      })
    ]
  );

  const insertedId = insertResult?.rows[0]?.id;
  if (insertedId) return insertedId;

  const existingResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.marketing_os_business_profiles
    where tenant_id = $1 and coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    limit 1
    `,
    [workspaceId, row.brand_id]
  );
  const existingId = existingResult?.rows[0]?.id ?? null;
  if (!existingId) return null;

  await queryPostgres(
    `
    update public.marketing_os_business_profiles
    set website_url = coalesce(website_url, $3),
        primary_phone = coalesce(primary_phone, $4),
        primary_email = coalesce(primary_email, $5),
        imported_from_url = $3,
        status = case when status = 'archived' then status else 'needs_review' end,
        metadata_json = metadata_json || $6::jsonb,
        last_refreshed_at = now(),
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      existingId,
      row.website_url,
      extraction.phones[0] ?? null,
      extraction.emails[0] ?? null,
      JSON.stringify({
        latestWebsiteImport: {
          importId: row.id,
          source: "safe_html_import_v1",
          reviewBeforeUse: true,
          title: extraction.title,
          metaDescription: extraction.metaDescription,
          headings: extraction.headings.slice(0, 8),
          serviceHints: extraction.serviceHints,
          serviceAreaHints: extraction.serviceAreaHints
        }
      })
    ]
  );

  return existingId;
}

export async function processWebsiteImport(workspaceId: string, importId: string): Promise<WebsiteImportProcessResult> {
  const gate = await getServiceGate(workspaceId, "website_import");
  if (!gate.enabled) {
    return { ok: false, importId, message: gate.reason };
  }

  const importResult = await queryPostgres<WebsiteImportRow>(
    `
    select id, tenant_id, brand_id, website_url
    from public.marketing_os_website_imports
    where tenant_id = $1 and id = $2 and status in ('queued', 'scanning', 'failed')
    limit 1
    `,
    [workspaceId, importId]
  );
  const row = importResult?.rows[0];
  if (!row) {
    return { ok: false, importId, message: "Website import was not found or is already waiting for review." };
  }

  const url = safeUrl(row.website_url);
  if (!url) {
    const message = "Use a public http or https website URL. Local and private network URLs are blocked.";
    await markImportFailed(workspaceId, importId, message);
    return { ok: false, importId, message };
  }

  await queryPostgres(
    `
    update public.marketing_os_website_imports
    set status = 'scanning',
        error_message = null,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, importId, JSON.stringify({ safeHtmlImportStartedAt: new Date().toISOString() })]
  );

  try {
    const analysisResult = await analyzePublicWebsiteUrl(row.website_url);
    if (!analysisResult.ok) throw new Error(analysisResult.message);
    const { finalUrl, contentType, htmlCharsRead, formCount, ctaHints, trustHints, mediaHints, ...extracted } = analysisResult.analysis;
    const profileId = await upsertReviewProfile(workspaceId, row, extracted);

    await queryPostgres(
      `
      update public.marketing_os_website_imports
      set status = 'needs_review',
          profile_id = $3,
          extraction_json = $4::jsonb,
          metadata_json = metadata_json || $5::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        importId,
        profileId,
        JSON.stringify(extracted),
        JSON.stringify({
          processedBy: "safe_html_import_v1",
          reviewBeforeUse: true,
          finalUrl,
          contentType,
          noPublishing: true,
          noLiveSync: true,
          htmlCharsRead,
          formCount,
          ctaHints,
          trustHints,
          mediaHints
        })
      ]
    );

    await logWebsiteImport(
      workspaceId,
      "Website facts imported for review",
      "Ferocity safely read the public page and saved extracted business facts for review. No pages, messages, ads, or provider sync were published.",
      { importId, profileId, websiteUrl: row.website_url, extractedFields: Object.keys(extracted), noPublishing: true }
    );

    return {
      ok: true,
      importId,
      profileId,
      message: "Website facts were imported for review. Nothing was published.",
      extracted
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website import failed.";
    await markImportFailed(workspaceId, importId, message);
    await logWebsiteImport(workspaceId, "Website import needs attention", message, { importId, websiteUrl: row.website_url });
    return { ok: false, importId, message };
  }
}

export async function processNewestWebsiteImportForUrl(workspaceId: string, websiteUrl: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.marketing_os_website_imports
    where tenant_id = $1 and website_url = $2 and status in ('queued', 'scanning', 'failed')
    order by created_at desc
    limit 1
    `,
    [workspaceId, websiteUrl]
  );
  const importId = result?.rows[0]?.id;
  if (!importId) {
    return { ok: false, message: "No queued website import was found to process." };
  }
  return processWebsiteImport(workspaceId, importId);
}
