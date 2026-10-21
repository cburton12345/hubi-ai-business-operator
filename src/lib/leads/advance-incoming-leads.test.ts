import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));

import { advanceIncomingLeadsForTenant, buildInitialLeadResponse } from "./advance-incoming-leads";

describe("buildInitialLeadResponse", () => {
  beforeEach(() => queryPostgresMock.mockReset());
  it("uses known service context and asks one useful next question", () => {
    expect(buildInitialLeadResponse({
      name: "Taylor Morgan",
      lead_type: "quote",
      message: "The roof is leaking over the kitchen.",
      service_interest: "roof repair",
      appointment_window: null,
    })).toBe("Hi Taylor, thanks for reaching out about roof repair. What outcome are you hoping for, and is there a deadline or timing constraint we should account for?");
  });

  it("confirms appointment context without claiming a booking", () => {
    expect(buildInitialLeadResponse({
      name: "Jordan",
      lead_type: "appointment",
      message: null,
      service_interest: "furnace inspection",
      appointment_window: "Tuesday afternoon",
    })).toContain("I have your preferred window as Tuesday afternoon. Is that still the best timing");
  });

  it("handles incomplete context without inventing facts", () => {
    expect(buildInitialLeadResponse({
      name: null,
      lead_type: "general",
      message: null,
      service_interest: null,
      appointment_window: null,
    })).toBe("Hi, thanks for reaching out. What can we help with, and is there a deadline or preferred timing we should account for?");
  });

  it("advances one candidate idempotently through the existing business records", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        lead_id: "lead-1", brand_id: "brand-1", name: "Taylor", email: "taylor@example.com",
        phone: null, message: "Need roof repair", lead_type: "quote", service_interest: "roof repair",
        appointment_window: null,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "workflow-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(advanceIncomingLeadsForTenant("tenant-1")).resolves.toEqual({
      duplicatesLinked: 1,
      customersCreated: 1,
      customersUpdated: 1,
      opportunitiesCreated: 1,
      opportunitiesUpdated: 1,
      threadsCreated: 1,
      initialResponsesPrepared: 1,
      incompleteLeadsEscalated: 1,
    });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("'new_lead_response'"),
      expect.arrayContaining(["tenant-1", "brand-1", "lead-1", "email"]),
    );

    const threadInsert = queryPostgresMock.mock.calls[5]?.[0];
    const responseCandidateQuery = queryPostgresMock.mock.calls[6]?.[0];
    expect(String(threadInsert)).toContain("not (l.metadata_json ? 'duplicateOfLeadId')");
    expect(String(responseCandidateQuery)).toContain("not (l.metadata_json ? 'duplicateOfLeadId')");
  });
});
