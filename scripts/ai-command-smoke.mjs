import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const checks = [
  {
    file: "src/app/app/ai-workforce/actions.ts",
    needles: [
      "createAdAutopilotPackageAction",
      "createCommandReminder",
      "createCommandTask",
      "ai_command_runs",
      "receipt",
      "log my hours",
      "auto_when_connected"
    ]
  },
  {
    file: "src/app/app/ai-workforce/results/[runId]/page.tsx",
    needles: [
      "Here is what Ferocity did.",
      "Missing Info Or Blockers",
      "Posting And Provider Readiness",
      "Command Activity"
    ]
  },
  {
    file: "src/components/admin/AppShell.tsx",
    needles: [
      "Tell Ferocity what to do",
      "executeAiWorkforceCommandSimpleAction"
    ]
  },
  {
    file: "src/app/app/page.tsx",
    needles: [
      "executeAiWorkforceCommandSimpleAction",
      "Say what you need in normal words.",
      "Create an estimate for the Johnson roof"
    ]
  },
  {
    file: "src/app/app/ai-workforce/AiCommandPanel.tsx",
    needles: [
      "Open result",
      "Make me a video ad"
    ]
  },
  {
    file: "supabase/migrations/095_ai_command_runs.sql",
    needles: [
      "create table if not exists public.ai_command_runs",
      "missing_info_json",
      "routes_json",
      "enable row level security"
    ]
  }
];

let failed = 0;

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  const content = await readFile(fullPath, "utf8");
  for (const needle of check.needles) {
    if (!content.includes(needle)) {
      failed += 1;
      console.error(`missing "${needle}" in ${check.file}`);
    }
  }
}

if (failed > 0) {
  console.error(`AI command smoke failed with ${failed} missing assertion(s).`);
  process.exit(1);
}

console.log("AI command smoke passed.");
