import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("SEO autopilot reconciliation", () => {
  it("preserves existing drafts and reconciles each monthly output by a durable key", async () => {
    const source = await readFile(new URL("./seo-autopilot.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/delete from public\.ai_drafts/i);
    expect(source).toContain("const periodKey = new Date().toISOString().slice(0, 7)");
    expect(source).toContain("on conflict (tenant_id, brand_id, generation_key) where generation_key is not null");
    expect(source).toContain("if (draftResult.rows[0]?.inserted) draftsCreated += 1");
    expect(source).toContain("if (calendarResult?.rows[0]?.inserted) calendarItemsCreated += 1");
    expect(source).toContain("if (recommendationResult?.rows[0]?.inserted) recommendationsCreated += 1");
    expect(source).toContain("if (result?.rows[0]?.inserted) publishingConnectionsCreated += 1");
    expect(source).toContain("if (result?.rows[0]?.inserted) visibilityChecksCreated += 1");
    expect(source).toContain("if (result?.rows[0]?.inserted) strategyItemsCreated += 1");
    expect(source).toContain("if (result?.rows[0]?.inserted) authorityTasksCreated += 1");
    expect(source).toContain("'seo-traffic-engine:activation'");
  });

  it("adds isolated idempotency keys without changing existing rows", async () => {
    const migration = await readFile(new URL("../../../supabase/migrations/292_seo_autopilot_idempotency.sql", import.meta.url), "utf8");
    for (const table of ["ai_drafts", "recommendations", "marketing_calendar_items", "publishing_queue", "operator_timeline_events"]) {
      expect(migration).toContain(`alter table public.${table} add column if not exists generation_key text`);
    }
    expect(migration).not.toMatch(/delete\s+from/i);
    expect(migration.match(/create unique index if not exists/g)).toHaveLength(5);
  });
});
