import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function git(args) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true }).trim();
}

const statusLines = git(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
const changes = statusLines.map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: git(["rev-parse", "HEAD"]),
  branch: git(["branch", "--show-current"]),
  dirty: changes.length > 0,
  changedFileCount: changes.length,
  changes,
  migrations: [
    "250_document_email_ingestion_jobs",
    "251_integration_authority_receipts",
    "252_external_ai_mcp_credentials",
    "253_adaptive_campaign_and_market_learning",
    "254_ferocity_chat_request_durability",
    "255_h4r_financial_analysis_bridge",
    "256_platform_subscription_revenue_ledger",
    "257_customer_money_reconciliation",
    "258_customer_portal_token_security",
    "259_change_order_lifecycle",
    "260_inventory_location_control",
    "261_inventory_cost_and_supplier_returns",
  ],
  releaseBoundaries: {
    deployPerformed: false,
    migrationsApplied: false,
    dnsModified: false,
    productionDataUsedInAutomatedTests: false,
  },
};
const output = path.resolve(process.env.FEROCITY_RELEASE_MANIFEST ?? "artifacts/release-foundation-manifest.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
console.log(`Release manifest written to ${path.relative(process.cwd(), output)} (${changes.length} changed files; no file contents or secrets).`);
