import fs from "node:fs";
import { spawnSync } from "node:child_process";

const env = { ...process.env };

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
}

const result = spawnSync(process.execPath, ["scripts/run-migrations.mjs"], {
  env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
