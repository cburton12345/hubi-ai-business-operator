import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = ".env.local";
const current = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const existing = current.match(/^SECURITY_HMAC_KEY=(.+)$/m)?.[1]?.trim();
const secret = existing && existing.length >= 43 ? existing.replace(/^['"]|['"]$/g, "") : crypto.randomBytes(48).toString("base64url");
const next = /^SECURITY_HMAC_KEY=.*$/m.test(current)
  ? current.replace(/^SECURITY_HMAC_KEY=.*$/m, `SECURITY_HMAC_KEY=${secret}`)
  : `${current.replace(/\s*$/, "")}\nSECURITY_HMAC_KEY=${secret}\n`;
fs.writeFileSync(envFile, next, { encoding: "utf8", mode: 0o600 });

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
for (const context of ["production", "deploy-preview", "branch-deploy"]) {
  const result = spawnSync(executable, ["--yes", "netlify", "env:set", "SECURITY_HMAC_KEY", secret, "--secret", "--context", context], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    throw new Error(`Netlify rejected SECURITY_HMAC_KEY for ${context}: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
}
console.log("SECURITY_HMAC_KEY configured locally and on the linked Netlify site without deploying.");
