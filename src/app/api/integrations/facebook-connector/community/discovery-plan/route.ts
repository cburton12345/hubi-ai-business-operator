import { NextResponse } from "next/server";
import { authenticateFacebookConnector } from "@/lib/growth/facebook-connector-protocol";
import { queryPostgres } from "@/lib/db/postgres";

type BrandContext = {
  name: string;
  industry: string | null;
  vertical: string | null;
  primary_location: string | null;
  services: string[];
  locations: string[];
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/[^\p{L}\p{N}\s&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:observe");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });
  const result = await queryPostgres<BrandContext>(`
    select b.name,b.industry,b.vertical,b.primary_location,
      coalesce((select array_agg(s.name order by s.priority desc,s.name) from public.brand_services s
        where s.tenant_id=b.tenant_id and s.brand_id=b.id and s.active=true),array[]::text[]) services,
      coalesce((select array_agg(coalesce(l.service_area_name,concat_ws(', ',l.city,l.state)) order by l.priority desc)
        from public.brand_locations l where l.tenant_id=b.tenant_id and l.brand_id=b.id and l.active=true),array[]::text[]) locations
    from public.brands b where b.tenant_id=$1 and b.id=$2 and b.status='active' limit 1
  `, [auth.tenant_id, auth.brand_id]);
  const brand = result?.rows[0];
  if (!brand) return NextResponse.json({ ok: true, searchTerms: [] }, { headers: { "Cache-Control": "no-store" } });

  const location = clean(brand.locations[0] || brand.primary_location);
  const topics = [...brand.services.slice(0, 3), brand.industry, brand.vertical].map(clean).filter(Boolean);
  const focused = topics.flatMap((topic) => [location ? `${location} ${topic}` : topic, `${topic} professionals`]);
  const adjacent = [location ? `${location} business owners` : "small business owners", "entrepreneurs and business owners"];
  const searchTerms = [...new Set([...focused, ...adjacent].map(clean).filter((term) => term.length >= 3))].slice(0, 8);
  return NextResponse.json({
    ok: true,
    searchTerms,
    policy: { maxResults: 20, focusedShare: 0.75, adjacentShare: 0.25, joinsRequireApproval: true, postsRequireRules: true }
  }, { headers: { "Cache-Control": "no-store" } });
}
