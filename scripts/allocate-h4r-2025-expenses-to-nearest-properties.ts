import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const allocationVersion = "h4r_2025_nearest_property_v1";
const expected = { rows: 1995, expenses: 1762, expenseCents: 8405279 };

type ContextProperty = { property_id: string; property_name: string };
type Context = { active_properties: ContextProperty[]; integrity: { read_only: boolean; mutations_performed: number } };
type Location = { city: string; state: string };
type Coordinates = { latitude: number; longitude: number; displayName: string };
type Property = {
  ref: string; label: string; addressQuery: string; location: Location; source: "h4r" | "owner_supplemental";
  coordinates?: Coordinates;
};
type Row = {
  id: string; transaction_date: string | null; description: string; merchant_name: string | null;
  amount_cents: number; direction: "debit" | "credit"; is_transfer: boolean;
  metadata_json: Record<string, unknown>;
};
type Assignment = {
  row: Row; property: Property; method: "merchant_city_nearest" | "same_day_route" | "same_month_activity" | "portfolio_fallback";
  confidence: number; distanceMiles: number | null; merchantLocation: Location | null;
};
type ReusableAllocation = {
  version: string;
  sourceGuard: { rows: number; expenses: number; expenseCents: number };
  assignments: Array<{
    transactionId: string; propertyRef: string; propertyLabel: string;
    method: Assignment["method"]; confidence: number; distanceMiles: number | null;
    merchantLocation: Location | null;
  }>;
};

const ownerSupplemental = [
  ["871 Hwy 99, Sedan KS", "Sedan", "KS"],
  ["105 N Herndon, Kirbyville TX", "Kirbyville", "TX"],
  ["940 Albemarle, St Paul MN", "St Paul", "MN"],
  ["1095 4th St E, St Paul MN", "St Paul", "MN"],
  ["8437 Church, St Louis MO", "St Louis", "MO"],
  ["3214 Dodier, St Louis MO", "St Louis", "MO"],
  ["612 Farlo, St Louis MO", "St Louis", "MO"],
  ["1500 Garden Lane, St Louis MO", "St Louis", "MO"],
  ["241 Glen Garry, St Louis MO", "St Louis", "MO"],
  ["11646 Raymond Ave, St Louis MO", "St Louis", "MO"],
  ["10132 Winkler, St Louis MO", "St Louis", "MO"],
  ["201 West Kendall, Martinsville IL", "Martinsville", "IL"],
  ["6822 Old Amish Road, Plover WI", "Plover", "WI"],
  ["464 West Karner, Stevens Point WI", "Stevens Point", "WI"],
] as const;

const ignoredTestProperties = new Set(["again", "battery", "don t be", "phone", "suoeruser", "tesss", "today", "trying", "welliguess"]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableRef(label: string) {
  return `owner-supplemental:${createHash("sha256").update(normalize(label)).digest("hex").slice(0, 20)}`;
}

function streetNumber(value: string) {
  return normalize(value).match(/^\d+/)?.[0] ?? null;
}

function h4rLocation(name: string): Location | null {
  const value = normalize(name);
  const exact: Array<[string, Location]> = [
    ["1290th previously", { city: "Boyceville", state: "WI" }],
    ["404 bluff", { city: "Prairie Farm", state: "WI" }],
    ["elk mound", { city: "Elk Mound", state: "WI" }],
  ];
  for (const [key, location] of exact) if (value === key) return location;
  const matches: Array<[string, Location]> = [
    ["wisconsin dells", { city: "Wisconsin Dells", state: "WI" }],
    ["springvalley", { city: "Spring Valley", state: "WI" }],
    ["spring valley", { city: "Spring Valley", state: "WI" }],
    ["menomonie", { city: "Menomonie", state: "WI" }],
    ["ridgeland", { city: "Ridgeland", state: "WI" }],
    ["spooner", { city: "Spooner", state: "WI" }],
    ["colfax", { city: "Colfax", state: "WI" }],
    ["brule", { city: "Brule", state: "WI" }],
    ["amery", { city: "Amery", state: "WI" }],
    ["blue earth", { city: "Blue Earth", state: "MN" }],
    ["st paul", { city: "St Paul", state: "MN" }],
    ["st louis", { city: "St Louis", state: "MO" }],
  ];
  return matches.find(([key]) => value.includes(key))?.[1] ?? null;
}

function h4rDisplayName(name: string) {
  const value = normalize(name);
  if (value === "1290th previously") return "1290th, Boyceville WI";
  if (value === "404 bluff") return "404 Bluff, Prairie Farm WI";
  return name;
}

function buildProperties(context: Context) {
  const properties: Property[] = ownerSupplemental.map(([label, city, state]) => ({
    ref: stableRef(label), label, addressQuery: label, location: { city, state }, source: "owner_supplemental",
  }));
  for (const current of context.active_properties) {
    if (ignoredTestProperties.has(normalize(current.property_name))) continue;
    const number = streetNumber(current.property_name);
    const supplemental = number ? properties.find((property) => streetNumber(property.label) === number) : null;
    if (supplemental) {
      supplemental.ref = current.property_id;
      supplemental.source = "h4r";
      continue;
    }
    const location = h4rLocation(current.property_name);
    if (!location) continue;
    const label = h4rDisplayName(current.property_name);
    properties.push({
      ref: current.property_id, label,
      addressQuery: `${label}, ${location.state}`,
      location, source: "h4r",
    });
  }
  const seen = new Set<string>();
  return properties.filter((property) => {
    const key = `${normalize(property.label)}|${property.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function merchantLocation(row: Row): Location | null {
  const review = row.metadata_json?.h4r2025Review;
  if (!review || typeof review !== "object") return null;
  const value = (review as { merchantLocation?: { city?: unknown; state?: unknown } }).merchantLocation;
  const city = typeof value?.city === "string" ? value.city.trim() : "";
  const state = typeof value?.state === "string" ? value.state.trim().toUpperCase() : "";
  return city && /^[A-Z]{2}$/.test(state) ? { city, state } : null;
}

async function geocode(query: string, cache: Map<string, Coordinates | null>) {
  const key = normalize(query);
  if (cache.has(key)) return cache.get(key) ?? null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  const response = await fetch(url, { headers: { "User-Agent": "Ferocity/1.0 (hello@ferocity.live)", Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status} for ${query}.`);
  const payload = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = payload[0];
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);
  const result = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude, displayName: first.display_name ?? query }
    : null;
  cache.set(key, result);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return result;
}

function miles(left: Coordinates, right: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDistance = radians(right.latitude - left.latitude);
  const lonDistance = radians(right.longitude - left.longitude);
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(lonDistance / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearest(properties: Property[], coordinates: Coordinates) {
  return properties.filter((property) => property.coordinates).map((property) => ({
    property, distance: miles(coordinates, property.coordinates!),
  })).sort((left, right) => left.distance - right.distance || left.property.label.localeCompare(right.property.label))[0] ?? null;
}

function mostFrequent(assignments: Assignment[]) {
  const totals = new Map<string, { property: Property; count: number; cents: number }>();
  for (const assignment of assignments) {
    const current = totals.get(assignment.property.ref) ?? { property: assignment.property, count: 0, cents: 0 };
    current.count += 1;
    current.cents += Number(assignment.row.amount_cents);
    totals.set(assignment.property.ref, current);
  }
  return [...totals.values()].sort((left, right) => right.count - left.count || right.cents - left.cents || left.property.label.localeCompare(right.property.label))[0]?.property ?? null;
}

async function main() {
  const contextPath = process.argv.find((value) => value.startsWith("--context="))?.slice("--context=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  const reusePath = process.argv.find((value) => value.startsWith("--reuse="))?.slice("--reuse=".length);
  const apply = process.argv.includes("--apply");
  if (!contextPath || !outputPath) throw new Error("Provide --context=<H4R JSON> and --output=<allocation JSON>.");
  const context = JSON.parse(await readFile(path.resolve(contextPath), "utf8")) as Context;
  if (!context.integrity?.read_only || context.integrity.mutations_performed !== 0) throw new Error("H4R context is not a verified read-only export.");
  const properties = buildProperties(context);
  if (properties.length < 10) throw new Error("The property roster is unexpectedly incomplete.");
  const reusable = reusePath ? JSON.parse(await readFile(path.resolve(reusePath), "utf8")) as ReusableAllocation : null;
  if (reusable && (reusable.version !== allocationVersion
    || reusable.sourceGuard.rows !== expected.rows
    || reusable.sourceGuard.expenses !== expected.expenses
    || reusable.sourceGuard.expenseCents !== expected.expenseCents)) {
    throw new Error("Reusable allocation failed its source/version guard.");
  }
  const cache = new Map<string, Coordinates | null>();
  if (!reusable) {
    for (const property of properties) {
      property.coordinates = await geocode(property.addressQuery, cache) ?? await geocode(`${property.location.city}, ${property.location.state}`, cache) ?? undefined;
    }
    if (!properties.some((property) => property.coordinates)) throw new Error("No property locations could be geocoded.");
  }

  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`select 1 from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id where lower(u.email)=lower($2) and tu.status='active'
      and tu.role in ('owner','admin') and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected owner/workspace binding was not found.");
    const result = await client.query<Row>(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
      join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
      where bi.tenant_id=$1 and b.project_id=$2)
      select t.id::text,t.transaction_date::text,t.description,t.merchant_name,t.amount_cents,t.direction,t.is_transfer,t.metadata_json
      from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id order by t.transaction_date,t.id`, [tenantId, projectId]);
    const expenses = result.rows.filter((row) => row.direction === "debit" && !row.is_transfer);
    const expenseCents = expenses.reduce((sum, row) => sum + Number(row.amount_cents), 0);
    if (result.rowCount !== expected.rows || expenses.length !== expected.expenses || expenseCents !== expected.expenseCents) {
      throw new Error(`Source guard failed: ${JSON.stringify({ rows: result.rowCount, expenses: expenses.length, expenseCents })}`);
    }

    const assignments: Assignment[] = [];
    if (reusable) {
      const rowsById = new Map(expenses.map((row) => [row.id, row]));
      const propertiesByRef = new Map(properties.map((property) => [property.ref, property]));
      for (const saved of reusable.assignments) {
        const row = rowsById.get(saved.transactionId);
        const property = propertiesByRef.get(saved.propertyRef);
        if (!row || !property) {
          throw new Error(`Reusable allocation references an unknown row/property: ${saved.transactionId}.`);
        }
        assignments.push({ row, property, method: saved.method, confidence: saved.confidence,
          distanceMiles: saved.distanceMiles, merchantLocation: saved.merchantLocation });
      }
    }
    const unlocalized: Row[] = [];
    const locationCoordinates = new Map<string, Coordinates | null>();
    for (const row of reusable ? [] : expenses) {
      const location = merchantLocation(row);
      if (!location) {
        unlocalized.push(row);
        continue;
      }
      const key = `${location.city}, ${location.state}`;
      let coordinates = locationCoordinates.get(key);
      if (coordinates === undefined) {
        coordinates = await geocode(key, cache);
        locationCoordinates.set(key, coordinates);
      }
      const match = coordinates ? nearest(properties, coordinates) : null;
      if (!match) {
        unlocalized.push(row);
        continue;
      }
      assignments.push({
        row, property: match.property, method: "merchant_city_nearest", distanceMiles: match.distance,
        confidence: match.distance <= 25 ? 0.88 : match.distance <= 100 ? 0.76 : match.distance <= 250 ? 0.64 : 0.5,
        merchantLocation: location,
      });
    }

    const byDay = new Map<string, Assignment[]>();
    const byMonth = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      if (!assignment.row.transaction_date) continue;
      const day = assignment.row.transaction_date;
      const month = day.slice(0, 7);
      byDay.set(day, [...(byDay.get(day) ?? []), assignment]);
      byMonth.set(month, [...(byMonth.get(month) ?? []), assignment]);
    }
    const portfolioFallback = reusable ? null : mostFrequent(assignments);
    if (!reusable && !portfolioFallback) throw new Error("A portfolio fallback property could not be established.");
    for (const row of unlocalized) {
      const day = row.transaction_date ?? "";
      const month = day.slice(0, 7);
      const dayProperty = mostFrequent(byDay.get(day) ?? []);
      const monthProperty = mostFrequent(byMonth.get(month) ?? []);
      const property = dayProperty ?? monthProperty ?? portfolioFallback!;
      assignments.push({
        row, property,
        method: dayProperty ? "same_day_route" : monthProperty ? "same_month_activity" : "portfolio_fallback",
        confidence: dayProperty ? 0.67 : monthProperty ? 0.52 : 0.4,
        distanceMiles: null, merchantLocation: null,
      });
    }
    if (assignments.length !== expected.expenses || new Set(assignments.map((item) => item.row.id)).size !== expected.expenses) {
      throw new Error("Every expense must receive exactly one property assignment.");
    }

    const totals = properties.map((property) => {
      const rows = assignments.filter((assignment) => assignment.property.ref === property.ref);
      return {
        propertyRef: property.ref, propertyLabel: property.label, city: property.location.city, state: property.location.state,
        source: property.source, count: rows.length, amountCents: rows.reduce((sum, assignment) => sum + Number(assignment.row.amount_cents), 0),
        methods: Object.fromEntries(["merchant_city_nearest", "same_day_route", "same_month_activity", "portfolio_fallback"].map((method) => [method, rows.filter((assignment) => assignment.method === method).length])),
      };
    }).sort((left, right) => right.amountCents - left.amountCents || left.propertyLabel.localeCompare(right.propertyLabel));
    const output = {
      version: allocationVersion, generatedAt: new Date().toISOString(), mode: apply ? "applied" : "dry_run",
      sourceGuard: { rows: result.rowCount, expenses: expenses.length, expenseCents },
      propertyRoster: properties.map(({ coordinates, ...property }) => ({ ...property, geocoded: Boolean(coordinates), coordinates })),
      assignmentSummary: {
        assignedRows: assignments.length, assignedCents: assignments.reduce((sum, assignment) => sum + Number(assignment.row.amount_cents), 0),
        directNearestRows: assignments.filter((assignment) => assignment.method === "merchant_city_nearest").length,
        sameDayRows: assignments.filter((assignment) => assignment.method === "same_day_route").length,
        sameMonthRows: assignments.filter((assignment) => assignment.method === "same_month_activity").length,
        fallbackRows: assignments.filter((assignment) => assignment.method === "portfolio_fallback").length,
      },
      propertyTotals: totals,
      assignments: assignments.sort((left, right) => (left.row.transaction_date ?? "").localeCompare(right.row.transaction_date ?? "") || left.row.id.localeCompare(right.row.id)).map((assignment) => ({
        transactionId: assignment.row.id, date: assignment.row.transaction_date, description: assignment.row.description,
        amountCents: Number(assignment.row.amount_cents), propertyRef: assignment.property.ref, propertyLabel: assignment.property.label,
        method: assignment.method, confidence: assignment.confidence, distanceMiles: assignment.distanceMiles === null ? null : Math.round(assignment.distanceMiles * 10) / 10,
        merchantLocation: assignment.merchantLocation,
      })),
    };

    if (apply) {
      const payload = assignments.map((assignment) => ({
        id: assignment.row.id, target_ref: assignment.property.ref, target_label: assignment.property.label,
        confidence: assignment.confidence,
        rationale: assignment.method === "merchant_city_nearest"
          ? `Nearest 2025 property to ${assignment.merchantLocation!.city}, ${assignment.merchantLocation!.state} (${assignment.distanceMiles === null ? "distance unavailable" : `${Math.round(assignment.distanceMiles)} miles`}); proximity assignment requested by owner.`
          : `${assignment.method.replaceAll("_", " ")} allocation used because the transaction had no reliable merchant city; proximity assignment requested by owner.`,
        review: {
          version: allocationVersion, assignedAt: new Date().toISOString(), method: assignment.method,
          distanceMiles: assignment.distanceMiles, merchantLocation: assignment.merchantLocation,
          ownerAuthorizedApproximateProximity: true, confirmedFromReceiptOrJob: false,
        },
      }));
      await client.query("begin");
      try {
        const updated = await client.query(`with incoming as (
            select id::uuid,target_ref,target_label,confidence,rationale,review
            from jsonb_to_recordset($3::jsonb) as x(id text,target_ref text,target_label text,confidence numeric,rationale text,review jsonb)
          ) update public.document_intelligence_transactions t set allocation_target_type='property',
            allocation_target_ref=incoming.target_ref,allocation_target_label=incoming.target_label,
            allocation_confidence=incoming.confidence,allocation_rationale=incoming.rationale,
            metadata_json=jsonb_set(
              case when jsonb_typeof(t.metadata_json)='object' then t.metadata_json else '{}'::jsonb end,
              '{h4r2025NearestPropertyAllocation}',incoming.review,true
            ),updated_at=now()
          from incoming where t.tenant_id=$1 and t.id=incoming.id
            and exists (select 1 from public.document_intelligence_import_batch_items bi
              join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
              where bi.tenant_id=$1 and b.project_id=$2 and bi.document_id=t.document_id)
            and t.direction='debit' and not t.is_transfer`, [tenantId, projectId, JSON.stringify(payload)]);
        if (updated.rowCount !== expected.expenses) throw new Error(`Expected ${expected.expenses} updates; received ${updated.rowCount}.`);
        const check = await client.query<{ assigned: number; cents: string; targeted: number; sample: unknown }>(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id where bi.tenant_id=$1 and b.project_id=$2)
          select count(*) filter(where t.allocation_target_ref is not null
              and t.metadata_json->'h4r2025NearestPropertyAllocation'->>'version'=$3)::int assigned,
            coalesce(sum(t.amount_cents) filter(where t.allocation_target_ref is not null
              and t.metadata_json->'h4r2025NearestPropertyAllocation'->>'version'=$3),0)::bigint::text cents,
            count(*) filter(where t.allocation_target_ref is not null)::int targeted,
            (array_agg(t.metadata_json->'h4r2025NearestPropertyAllocation') filter(where t.allocation_target_ref is not null))[1] sample
          from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
          where t.direction='debit' and not t.is_transfer`, [tenantId, projectId, allocationVersion]);
        if (check.rows[0]?.assigned !== expected.expenses || Number(check.rows[0]?.cents) !== expected.expenseCents) {
          throw new Error(`Post-write allocation certification failed: ${JSON.stringify(check.rows[0] ?? null)}.`);
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
    console.log(JSON.stringify({ mode: output.mode, allocationVersion, summary: output.assignmentSummary, propertyTotals: totals }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
