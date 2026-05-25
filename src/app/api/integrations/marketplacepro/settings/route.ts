import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketplaceAccountId = url.searchParams.get("marketplaceAccountId");
  const vendorId = url.searchParams.get("vendorId");

  if (!marketplaceAccountId && !vendorId) {
    return NextResponse.json({
      ok: true,
      provider: "marketplacepro",
      status: "settings_stub_ready",
      message: "Pass marketplaceAccountId or vendorId to check whether a MarketplacePro vendor is mapped to Ferocity."
    });
  }

  const result = await queryPostgres<{
    connection_status: string;
    sync_status: string;
    profile_mode: string;
    last_sync_at: string | null;
  }>(
    `
    select connection_status, sync_status, profile_mode, last_sync_at
    from public.marketplacepro_connections
    where ($1::text is null or marketplace_account_id = $1)
      and ($2::text is null or marketplace_vendor_id = $2)
    order by updated_at desc
    limit 1
    `,
    [marketplaceAccountId, vendorId]
  );
  const row = result?.rows[0];

  if (!row) {
    return NextResponse.json({
      ok: true,
      provider: "marketplacepro",
      connected: false,
      status: "not_connected",
      message: "This MarketplacePro vendor is not mapped to a Ferocity workspace yet."
    });
  }

  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    connected: row.connection_status === "connected",
    status: row.connection_status,
    syncStatus: row.sync_status,
    profileMode: row.profile_mode,
    lastSyncAt: row.last_sync_at,
    message: "MarketplacePro can use this mapping for optional Ferocity-powered operations."
  });
}
