import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

const activitySchema = z.object({
  path: z.string().trim().min(1).max(300).regex(/^\/[A-Za-z0-9_\-/.]*$/),
  referrer: z.string().trim().max(1000).nullable().optional(),
  campaignSource: z.string().trim().max(120).nullable().optional(),
  campaignMedium: z.string().trim().max(120).nullable().optional(),
  campaignName: z.string().trim().max(180).nullable().optional()
});

const privatePrefixes = [
  "/app", "/api", "/invite", "/portal", "/estimate", "/review", "/proof",
  "/refer", "/visit", "/forms", "/workers", "/book", "/chat", "/employee"
];

function isPrivatePath(path: string) {
  return privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function referrerHost(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().slice(0, 180);
  } catch {
    return null;
  }
}

function looksLikeBot(userAgent: string) {
  return /bot|crawler|spider|headless|preview|lighthouse|uptimerobot/i.test(userAgent);
}

function deviceClass(userAgent: string) {
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone/i.test(userAgent)) return "mobile";
  return "desktop";
}

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (looksLikeBot(userAgent)) return new NextResponse(null, { status: 204 });

  const limit = await consumePublicRateLimit({
    request,
    scope: "public-site-activity",
    limit: 180,
    windowSeconds: 60 * 60
  });
  if (!limit.allowed) return new NextResponse(null, { status: 204 });

  const parsed = activitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || isPrivatePath(parsed.data.path)) {
    return NextResponse.json({ error: "Invalid activity." }, { status: 400 });
  }

  await queryPostgres(
    `insert into public.public_site_events (
       event_type, path, referrer_host, campaign_source, campaign_medium, campaign_name,
       device_class, metadata_json
     ) values ('page_view',$1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      parsed.data.path,
      referrerHost(parsed.data.referrer),
      parsed.data.campaignSource || null,
      parsed.data.campaignMedium || null,
      parsed.data.campaignName || null,
      deviceClass(userAgent),
      JSON.stringify({ privacy: "no_raw_ip_no_cookie_id", doNotTrackRespected: true })
    ]
  );

  return new NextResponse(null, { status: 204 });
}
