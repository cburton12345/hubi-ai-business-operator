import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const protectScript = "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($p)";
const unprotectScript = "$v=[Console]::In.ReadToEnd();$p=[Convert]::FromBase64String($v);$b=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($b)";

function credentialPath(root) {
  return path.join(root, "connector-token.dpapi");
}
function runPowerShell(script, input) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input,
    encoding: "utf8",
    windowsHide: true
  }).trim();
}

export function saveConnectorToken(root, token) {
  if (process.platform !== "win32") {
    throw new Error("Non-Windows workers must supply FEROCITY_CONNECTOR_TOKEN through their secret manager.");
  }
  const encrypted = runPowerShell(protectScript, token);
  fs.writeFileSync(credentialPath(root), encrypted, { encoding: "utf8", mode: 0o600 });
}

export function loadConnectorToken(root) {
  if (process.env.FEROCITY_CONNECTOR_TOKEN) return process.env.FEROCITY_CONNECTOR_TOKEN;
  if (process.platform !== "win32") throw new Error("Missing FEROCITY_CONNECTOR_TOKEN.");
  const file = credentialPath(root);
  if (!fs.existsSync(file)) throw new Error("Missing paired connector credential. Run npm run configure.");
  return runPowerShell(unprotectScript, fs.readFileSync(file, "utf8").trim());
}
