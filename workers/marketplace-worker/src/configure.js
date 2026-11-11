import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { saveConnectorToken } from "./credential-store.js";
import { pairWorker } from "./ferocity-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "worker.config.json");

function existingConfig() {
  if (!fs.existsSync(configPath)) return {};
  try { return JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { return {}; }
}

async function main() {
  if (process.platform !== "win32") throw new Error("Interactive pairing is currently for the local Windows worker. Hosted workers should use environment-managed secrets.");
  const existing = existingConfig();
  const rl = readline.createInterface({ input, output });
  const apiBase = (await rl.question(`Ferocity API base [${existing.apiBase || "https://ferocity.live/api/integrations/facebook-connector"}]: `)).trim()
    || existing.apiBase || "https://ferocity.live/api/integrations/facebook-connector";
  const code = (await rl.question("One-time pairing code from Ferocity: ")).replace(/[^a-z0-9]/gi, "").toUpperCase();
  const deviceName = (await rl.question(`Device name [${existing.deviceName || "Office Marketplace worker"}]: `)).trim()
    || existing.deviceName || "Office Marketplace worker";
  const expectedProfileId = (await rl.question(`Expected numeric Facebook profile ID [${existing.identity?.expectedProfileId || "required"}]: `)).trim()
    || existing.identity?.expectedProfileId || "";
  rl.close();
  if (code.length !== 12) throw new Error("The pairing code must contain 12 letters or numbers.");
  if (!/^\d{5,30}$/.test(expectedProfileId)) throw new Error("A numeric Facebook profile ID is required to lock this worker to the intended account.");

  const deviceId = existing.deviceId && existing.deviceId.length >= 16 ? existing.deviceId : crypto.randomUUID();
  const paired = await pairWorker({ apiBase, code, deviceId, deviceName, runtime: "windows_worker" });
  saveConnectorToken(root, paired.token);
  const config = {
    apiBase,
    deviceId,
    deviceName,
    runtime: "windows_worker",
    automationEnabled: true,
    killSwitchFile: "PAUSE",
    identity: { expectedProfileId },
    browser: {
      profileDir: ".facebook-profile",
      inboxUrl: "https://www.facebook.com/messages/requests",
      headless: false,
      channel: "chrome",
      maxThreadsPerSweep: 12,
      groupsFeedUrl: "https://www.facebook.com/groups/feed/",
      maxCommunitiesPerSweep: 8
    },
    scheduling: {
      controlPollSeconds: 20,
      inboundSweepSeconds: 300,
      communitySweepSeconds: 21600,
      idleTimeoutSeconds: 60,
      healthReportSeconds: 300,
      manualAttentionTimeoutSeconds: 1800,
      restartDelaySeconds: 10,
      maxRestartDelaySeconds: 300
    },
    sendEnabled: false,
    communityDiscoveryEnabled: false,
    actionPolicy: {
      maxGroupJoinsPerDay: 5,
      minimumWriteDelaySeconds: 45,
      maximumWriteDelaySeconds: 180,
      duplicatePostWindowDays: 90
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(`Paired ${deviceName} to Ferocity.`);
  console.log(`Saved non-secret settings to ${configPath}`);
  console.log("The connector credential is protected with Windows DPAPI for the current Windows user.");
  console.log("Sending remains disabled. Run an observe-only certification before changing sendEnabled to true.");
  console.log("Facebook group discovery remains disabled until the customer enables communityDiscoveryEnabled after reviewing the account and group scope.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
