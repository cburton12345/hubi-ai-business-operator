import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "-e", `
    import { buildUnifiedCapabilityLedger, summarizeUnifiedCapabilityLedger } from './src/lib/capabilities/unified-ledger.ts';
    const ledger = buildUnifiedCapabilityLedger();
    const summary = summarizeUnifiedCapabilityLedger(ledger);
    const constrained = ledger.filter((entry) => ['provider_approval_required','customer_connection_required','degraded','temporarily_unavailable'].includes(entry.evidenceState));
    console.log(JSON.stringify({ summary, constrained: constrained.map(({id,label,evidenceState,requirement}) => ({id,label,evidenceState,requirement})) }, null, 2));
  `],
  { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
