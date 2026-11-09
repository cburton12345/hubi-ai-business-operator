import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MarketplacePro workforce timeline schema", () => {
  it("keeps the contractor-network family aligned with the database constraint", () => {
    const adapter = fs.readFileSync(
      path.join(process.cwd(), "src/lib/integrations/marketplacepro.ts"),
      "utf8",
    );
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/283_marketplacepro_workforce_timeline_family.sql"),
      "utf8",
    );

    expect(adapter).toContain('return "workforce"');
    expect(migration).toContain("operator_timeline_events_event_family_check");
    expect(migration).toMatch(/event_family\s+in\s*\([\s\S]*'workforce'/);
  });

  it("keeps every contractor-network object type inside the object-link constraint", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/284_marketplacepro_contractor_object_links.sql"),
      "utf8",
    );

    for (const table of [
      "labor_requests",
      "worker_matches",
      "labor_assignments",
      "contractor_recruiting_leads",
      "coverage_requirements",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
  });
});
