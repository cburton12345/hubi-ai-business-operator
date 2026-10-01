import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverAdvertisingAccounts } from "./advertising-account-discovery";

afterEach(() => vi.unstubAllEnvs());

describe("advertising account discovery", () => {
  it("discovers and auto-selects one Google Ads customer", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "developer-token");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ resourceNames: ["customers/1234567890"] }), { status: 200 })) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "google_ads", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("1234567890");
    expect(discovery.selectionRequired).toBe(false);
  });

  it("discovers Meta ad accounts and pages without auto-selecting multiple ad accounts", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      return new Response(JSON.stringify(value.includes("adaccounts")
        ? { data: [{ id: "act_1", account_id: "1", name: "One" }, { id: "act_2", account_id: "2", name: "Two" }] }
        : { data: [{ id: "page-1", name: "Page One" }] }), { status: 200 });
    }) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "facebook", accessToken: "token", fetchImpl });
    expect(discovery.accounts).toHaveLength(3);
    expect(discovery.selectedAccountId).toBeNull();
    expect(discovery.selectionRequired).toBe(true);
  });

  it("discovers Reddit businesses and their ad accounts", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).endsWith("/me/businesses")
        ? { data: [{ id: "business-1", name: "Business" }] }
        : { data: [{ id: "account-1", name: "Ads", currency: "USD" }] }
    ), { status: 200 })) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "reddit", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("account-1");
    expect(discovery.accounts.some((account) => account.kind === "business")).toBe(true);
  });

  it("discovers Microsoft Advertising accounts for the signed-in user", async () => {
    vi.stubEnv("MICROSOFT_ADS_DEVELOPER_TOKEN", "developer-token");
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer token",
        developerToken: "developer-token"
      });
      return new Response(JSON.stringify(String(url).endsWith("/User/Query")
        ? { User: { Id: "193130747" }, CustomerRoles: [{ CustomerId: "255002807", AccountIds: ["187286578"] }] }
        : { Accounts: [{ Id: "187286578", Name: "Ferocity", ParentCustomerId: "255002807", AccountLifeCycleStatus: "Active", CurrencyType: "USD" }] }), { status: 200 });
    }) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "microsoft_ads", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("187286578");
    expect(discovery.accounts[0]).toMatchObject({ name: "Ferocity", parentId: "255002807", currency: "USD" });
  });

  it("discovers Pinterest ad accounts", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "pin-1", name: "Pinterest Ads", status: "ACTIVE" }] }), { status: 200 })) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "pinterest_ads", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("pin-1");
  });

  it("discovers Snap organizations and nested ad accounts", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ organizations: [{ organization: { id: "org-1", name: "Business", ad_accounts: [{ ad_account: { id: "snap-1", name: "Snap Ads", currency: "USD" } }] } }] }), { status: 200 })) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "snapchat_ads", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("snap-1");
    expect(discovery.accounts.some((account) => account.kind === "business")).toBe(true);
  });

  it("discovers Amazon advertising profiles", async () => {
    vi.stubEnv("AMAZON_ADS_CLIENT_ID", "amazon-client");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ profileId: 42, countryCode: "US", currencyCode: "USD", accountInfo: { name: "Amazon Store" } }]), { status: 200 })) as typeof fetch;
    const discovery = await discoverAdvertisingAccounts({ provider: "amazon_ads", accessToken: "token", fetchImpl });
    expect(discovery.selectedAccountId).toBe("42");
  });
});
