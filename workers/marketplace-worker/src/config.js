import fs from "node:fs";
import path from "node:path";

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function resolveConfigPath(argv = process.argv) {
  const index = argv.indexOf("--config");
  return path.resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : "worker.config.json");
}

export function loadWorkerConfig(configPath) {
  if (!fs.existsSync(configPath)) throw new Error(`Missing worker configuration: ${configPath}`);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const configRoot = path.dirname(configPath);
  const runtime = raw.runtime || "windows_worker";
  if (!["windows_worker", "hosted_worker"].includes(runtime)) throw new Error("runtime must be windows_worker or hosted_worker");
  if (!raw.deviceId || String(raw.deviceId).length < 16) throw new Error("A paired deviceId is required.");

  const sendEnabled = raw.sendEnabled === true;
  const expectedProfileId = String(raw.identity?.expectedProfileId || "").trim();
  if (expectedProfileId && !/^\d{5,30}$/.test(expectedProfileId)) throw new Error("identity.expectedProfileId must be a numeric Facebook profile ID.");
  if (sendEnabled && !expectedProfileId) throw new Error("identity.expectedProfileId is required before sendEnabled can be true.");
  const minimumWriteDelayMs = finiteNumber(raw.actionPolicy?.minimumWriteDelaySeconds, 45, 0, 3600) * 1000;
  const maximumWriteDelayMs = finiteNumber(raw.actionPolicy?.maximumWriteDelaySeconds, 180, 0, 7200) * 1000;
  if (maximumWriteDelayMs < minimumWriteDelayMs) throw new Error("actionPolicy.maximumWriteDelaySeconds must be greater than or equal to minimumWriteDelaySeconds.");

  return {
    configPath,
    root: configRoot,
    apiBase: String(raw.apiBase || "https://ferocity.live/api/integrations/facebook-connector").replace(/\/$/, ""),
    deviceId: String(raw.deviceId),
    deviceName: String(raw.deviceName || "Ferocity Marketplace worker").slice(0, 120),
    runtime,
    automationEnabled: raw.automationEnabled !== false,
    sendEnabled,
    communityDiscoveryEnabled: raw.communityDiscoveryEnabled === true,
    killSwitchFile: path.resolve(configRoot, raw.killSwitchFile || "PAUSE"),
    identity: {
      expectedProfileId: expectedProfileId || null
    },
    actionPolicy: {
      maxGroupJoinsPerDay: finiteNumber(raw.actionPolicy?.maxGroupJoinsPerDay, 5, 0, 25),
      minimumWriteDelayMs,
      maximumWriteDelayMs,
      duplicatePostWindowMs: finiteNumber(raw.actionPolicy?.duplicatePostWindowDays, 90, 1, 365) * 24 * 60 * 60 * 1000
    },
    browser: {
      profileDir: path.resolve(configRoot, raw.browser?.profileDir || ".facebook-profile"),
      inboxUrl: raw.browser?.inboxUrl || "https://www.facebook.com/messages/requests",
      headless: raw.browser?.headless === true,
      channel: raw.browser?.channel || undefined,
      maxThreadsPerSweep: finiteNumber(raw.browser?.maxThreadsPerSweep, 12, 1, 50),
      groupsFeedUrl: raw.browser?.groupsFeedUrl || "https://www.facebook.com/groups/feed/",
      maxCommunitiesPerSweep: finiteNumber(raw.browser?.maxCommunitiesPerSweep, 8, 1, 20)
    },
    scheduling: {
      controlPollMs: finiteNumber(raw.scheduling?.controlPollSeconds, 20, 5, 300) * 1000,
      inboundSweepMs: finiteNumber(raw.scheduling?.inboundSweepSeconds, 300, 60, 3600) * 1000,
      communitySweepMs: finiteNumber(raw.scheduling?.communitySweepSeconds, 21_600, 3600, 86_400) * 1000,
      idleTimeoutMs: finiteNumber(raw.scheduling?.idleTimeoutSeconds, 60, 15, 1800) * 1000,
      healthReportMs: finiteNumber(raw.scheduling?.healthReportSeconds, 300, 60, 1800) * 1000,
      manualAttentionTimeoutMs: finiteNumber(raw.scheduling?.manualAttentionTimeoutSeconds, 1800, 300, 7200) * 1000,
      restartDelayMs: finiteNumber(raw.scheduling?.restartDelaySeconds, 10, 5, 300) * 1000,
      maxRestartDelayMs: finiteNumber(raw.scheduling?.maxRestartDelaySeconds, 300, 30, 1800) * 1000
    }
  };
}
