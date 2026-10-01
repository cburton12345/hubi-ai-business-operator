import QRCode from "qrcode";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const result = await queryPostgres<{ slug: string }>(
    `select slug from public.conversation_acquisition_links where slug=$1 and status='active' and (expires_at is null or expires_at>now()) limit 1`,
    [slug.toLowerCase()]
  );
  if (!result?.rows[0]) return Response.json({ error: "Conversation link not found." }, { status: 404 });
  const baseUrl = (env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const png = await QRCode.toBuffer(`${baseUrl}/c/${result.rows[0].slug}`, { type: "png", width: 1024, margin: 3, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="ferocity-${result.rows[0].slug}-qr.png"`,
      "cache-control": "public, max-age=300"
    }
  });
}
