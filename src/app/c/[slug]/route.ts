import { openConversationAcquisitionLink } from "@/lib/growth/conversation-acquisition";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const opened = await openConversationAcquisitionLink({
    slug,
    query,
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
    ip: forwarded
  });
  if (!opened) return new Response("This conversation link is unavailable.", { status: 404, headers: { "cache-control": "no-store" } });
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(request.headers.get("user-agent") ?? "");
  const destination = !mobile && ["sms", "mms", "rcs"].includes(opened.channel) && opened.desktopFallback
    ? opened.desktopFallback
    : opened.destination;
  return new Response(null, {
    status: 302,
    headers: {
      location: destination,
      "cache-control": "no-store, private",
      "referrer-policy": "no-referrer"
    }
  });
}
