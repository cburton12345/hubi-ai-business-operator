import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { categoryForStatementDescription } from "../src/lib/document-intelligence/statement-classification";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const reviewVersion = "h4r_cash_app_2025_deterministic_v3";
const expected = { documents: 12, rows: 1995, debitCents: 8405279, creditCents: 14829968, transferCents: 6870242 };

type TenantContext = {
  tenant_id: string;
  tenant_name: string;
  unit_id: string;
  unit_label: string;
  property_id: string;
  property_name: string;
};

type PropertyContext = {
  property_id: string;
  property_name: string;
  units: Array<{ unit_id: string; unit_label: string }>;
};

type Context = {
  counts: { active_properties: number; active_units: number; active_tenants: number };
  active_properties: PropertyContext[];
  flat_active_tenants: TenantContext[];
  integrity: { read_only: boolean; mutations_performed: number };
};

type Row = {
  id: string;
  document_id: string;
  direction: "debit" | "credit";
  amount_cents: number;
  description: string;
  merchant_name: string | null;
  suggested_category: string | null;
  is_transfer: boolean;
  metadata_json: Record<string, unknown>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function inferPropertyLocation(name: string) {
  const normalized = normalize(name);
  const knownLocations = [
    ["wisconsin dells", "WI"], ["spring valley", "WI"], ["springvalley", "WI"],
    ["menomonie", "WI"], ["ridgeland", "WI"], ["colfax", "WI"], ["brule", "WI"],
    ["amery", "WI"], ["saint paul", "MN"], ["st paul", "MN"], ["blue earth", "MN"],
    ["saint louis", "MO"], ["st louis", "MO"],
  ] as const;
  for (const [city, state] of knownLocations) {
    if (normalized.includes(city)) return { city, state };
  }
  return null;
}

function merchantLocation(row: Row) {
  const withoutSuffix = row.description.replace(/\s+Cash App Card(?:\s+\(pending\))?\s*$/i, "").trim();
  const match = withoutSuffix.match(/\s([A-Z]{2})$/);
  if (!match) return null;
  const state = match[1].toUpperCase();
  const beforeState = normalize(withoutSuffix.slice(0, match.index).trim());
  const knownCities = [
    "wisconsin dells", "chippewa falls", "chippewa fall", "saint cloud", "saint louis", "saint paul",
    "blue earth", "spring valley", "panama city", "fairview heights", "fairview hts", "osage beach",
    "eau claire", "eau clair", "elk mound", "jefferson city", "lake hallie", "prairie du chien",
    "menomonie", "ridgeland", "colfax", "brule", "amery", "altoona", "hudson", "plover",
    "cumberland", "madison", "wilson", "hastings", "roanoke", "nekoosa", "baldwin", "bloomer",
    "somerset", "clearwater", "kissimmee", "davenport", "destin", "galveston", "tampa", "jupiter",
    "beaumont", "kirbyville", "bartlesville", "paragould", "hardy", "columbia", "waite park",
    "martinsville", "paducah", "salem", "springfield", "san jose", "bentonville", "edina", "barron",
    "troy", "peculiar", "mclean", "celebration",
  ].sort((left, right) => right.length - left.length);
  const city = knownCities.find((candidate) => beforeState.endsWith(candidate));
  const canonical = city?.replace("chippewa fall", "chippewa falls").replace("eau clair", "eau claire").replace("fairview hts", "fairview heights");
  return { city: canonical ? canonical.replace(/\b\w/g, (letter) => letter.toUpperCase()) : null, state };
}

function incomingCounterparty(description: string) {
  const match = description.trim().match(/^From\s+(.+?)\s+Cash App payment(?:\s+.*)?$/i);
  return match?.[1]?.trim() || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const contextPath = process.argv.find((value) => value.startsWith("--context="))?.slice("--context=".length);
  if (!contextPath) throw new Error("Provide --context=<authoritative H4R JSON path>.");
  const apply = process.argv.includes("--apply");
  const context = JSON.parse(await readFile(path.resolve(contextPath), "utf8")) as Context;
  if (!context.integrity?.read_only || context.integrity.mutations_performed !== 0) throw new Error("H4R context is not a verified read-only export.");
  if (context.counts.active_properties !== context.active_properties.length || context.counts.active_tenants !== context.flat_active_tenants.length) {
    throw new Error("H4R context declared counts do not match its records.");
  }

  const propertyLocations = context.active_properties.map((property) => ({ property, location: inferPropertyLocation(property.property_name) }));
  const tenantsByName = new Map<string, TenantContext[]>();
  for (const tenant of context.flat_active_tenants) {
    const key = normalize(tenant.tenant_name);
    if (!key || key === "?") continue;
    tenantsByName.set(key, [...(tenantsByName.get(key) ?? []), tenant]);
  }

  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`select 1 from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id where lower(u.email)=lower($2) and tu.status='active'
      and tu.role in ('owner','admin') and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected owner/workspace binding was not found.");

    const rows = await client.query<Row>(`with docs as (
        select distinct d.id,d.content_sha256 from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ) select t.id::text,t.document_id::text,t.direction,t.amount_cents,t.description,t.merchant_name,
        t.suggested_category,t.is_transfer,t.metadata_json from public.document_intelligence_transactions t join docs d on d.id=t.document_id
      order by t.id`, [tenantId, projectId]);
    const documents = await client.query<{ id: string; content_sha256: string }>(`select distinct d.id::text,d.content_sha256
      from public.document_intelligence_import_batch_items bi join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
      join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
      where bi.tenant_id=$1 and b.project_id=$2 order by 1`, [tenantId, projectId]);
    const totals = {
      debitCents: rows.rows.filter((row) => row.direction === "debit" && !row.is_transfer).reduce((sum, row) => sum + Number(row.amount_cents), 0),
      creditCents: rows.rows.filter((row) => row.direction === "credit" && !row.is_transfer).reduce((sum, row) => sum + Number(row.amount_cents), 0),
      transferCents: rows.rows.filter((row) => row.is_transfer).reduce((sum, row) => sum + Number(row.amount_cents), 0),
    };
    if (documents.rowCount !== expected.documents || rows.rowCount !== expected.rows || Object.entries(totals).some(([key, value]) => value !== expected[key as keyof typeof expected])) {
      throw new Error(`Preserved-source guard failed: ${JSON.stringify({ documents: documents.rowCount, rows: rows.rowCount, totals })}`);
    }

    const changes = rows.rows.map((row) => {
      const derivedCategory = row.is_transfer ? "transfer" : categoryForStatementDescription(row.description);
      const placeholder = !row.suggested_category || ["uncategorized", "payment_needs_classification", "deposit_needs_classification"].includes(row.suggested_category);
      const category = placeholder && derivedCategory !== "uncategorized" ? derivedCategory : row.suggested_category;
      const initialLocation = merchantLocation(row);
      const normalizedDescription = normalize(row.description);
      const matchingPropertyLocations = propertyLocations.filter(({ location: candidate }) => candidate
        && normalizedDescription.includes(candidate.city) && normalizedDescription.includes(normalize(candidate.state)));
      const matchedLocations = [...new Map(matchingPropertyLocations.map(({ location }) => [`${location!.city}:${location!.state}`, location!])).values()];
      const location = matchedLocations.length === 1
        ? { city: matchedLocations[0].city.replace(/\b\w/g, (letter) => letter.toUpperCase()), state: matchedLocations[0].state }
        : initialLocation;
      const locationCandidates = matchingPropertyLocations.map(({ property }) => ({
          propertyId: property.property_id, propertyName: property.property_name,
          units: property.units.map((unit) => ({ unitId: unit.unit_id, unitLabel: unit.unit_label })),
        }));
      const counterparty = row.direction === "credit" && !row.is_transfer ? incomingCounterparty(row.description) : null;
      const tenantMatches = counterparty ? tenantsByName.get(normalize(counterparty)) ?? [] : [];
      const review = {
        version: reviewVersion,
        reviewedAt: new Date().toISOString(),
        method: "deterministic_classification_plus_authoritative_h4r_context",
        categoryBasis: category !== row.suggested_category ? "deterministic_merchant_rule" : "preserved_existing_classification",
        taxTreatmentConfirmed: false,
        merchantLocation: location,
        propertyCandidates: locationCandidates,
        propertyAssignmentConfirmed: false,
        incomingCounterparty: counterparty,
        tenantCandidates: tenantMatches.map((tenant) => ({
          tenantId: tenant.tenant_id, tenantName: tenant.tenant_name, unitId: tenant.unit_id,
          unitLabel: tenant.unit_label, propertyId: tenant.property_id, propertyName: tenant.property_name,
        })),
        tenantMatchStatus: !counterparty ? "not_applicable" : tenantMatches.length === 1 ? "exact_name_candidate" : tenantMatches.length > 1 ? "ambiguous" : "unmatched",
        tenantPaymentConfirmed: false,
      };
      return { row, category, review };
    });

    if (apply) {
      await client.query("begin");
      try {
        const payload = changes.map((change) => ({ id: change.row.id, category: change.category, review: change.review }));
        const updated = await client.query(`with incoming as (
            select id::uuid,category,review from jsonb_to_recordset($3::jsonb) as x(id text,category text,review jsonb)
          ) update public.document_intelligence_transactions t set suggested_category=incoming.category,
            metadata_json=t.metadata_json || jsonb_build_object('h4r2025Review',incoming.review),updated_at=now()
          from incoming where t.id=incoming.id and t.tenant_id=$1
            and exists (select 1 from public.document_intelligence_import_batch_items bi
              join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
              where bi.tenant_id=$1 and b.project_id=$2 and bi.document_id=t.document_id)`, [tenantId, projectId, JSON.stringify(payload)]);
        if (updated.rowCount !== expected.rows) throw new Error(`Expected to update ${expected.rows} scoped rows; updated ${updated.rowCount}.`);
        const verified = await client.query<{ rows: number; reviewed: number }>(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id where bi.tenant_id=$1 and b.project_id=$2)
          select count(*)::int rows,count(*) filter (where t.metadata_json->'h4r2025Review'->>'version'=$3)::int reviewed
          from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id`, [tenantId, projectId, reviewVersion]);
        if (verified.rows[0]?.rows !== expected.rows || verified.rows[0]?.reviewed !== expected.rows) throw new Error("Post-write certification did not cover all scoped rows.");
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const categoryCounts = changes.reduce<Record<string, number>>((acc, change) => {
      const key = change.category || "uncategorized";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const locationSamples = changes.filter((change) => change.review.merchantLocation?.state).slice(0, 20).map((change) => ({
      description: change.row.description,
      merchant: change.row.merchant_name,
      location: change.review.merchantLocation,
    }));
    console.log(JSON.stringify({
      mode: apply ? "applied" : "dry_run", reviewVersion,
      sourceGuard: { documents: documents.rowCount, rows: rows.rowCount, totals, sourceSetSha256: sha256(documents.rows.map((row) => `${row.id}:${row.content_sha256}`).join("\n")) },
      reviewedRows: changes.length,
      changedCategories: changes.filter((change) => change.category !== change.row.suggested_category).length,
      exactTenantNameCandidates: changes.filter((change) => change.review.tenantMatchStatus === "exact_name_candidate").length,
      unmatchedIncomingNames: changes.filter((change) => change.review.tenantMatchStatus === "unmatched").length,
      rowsWithPropertyCandidates: changes.filter((change) => change.review.propertyCandidates.length > 0).length,
      categoryCounts,
      locationSamples,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
