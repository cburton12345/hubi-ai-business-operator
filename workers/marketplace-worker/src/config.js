import fs from "node:fs";
import path from "node:path";

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function environmentBoolean(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean environment value: ${value}`);
}

export function resolveConfigPath(argv = process.argv) {
  const index = argv.indexOf("--config");
  return path.resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : "worker.config.json");
}

export function loadWorkerConfig(configPath) {
  if (!fs.existsSync(configPath)) throw new Error(`Missing worker configuration: ${configPath}`);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const configRoot = path.resolve(process.env.FEROCITY_WORKER_ROOT || path.dirname(configPath));
  const runtime = process.env.FEROCITY_CONNECTOR_RUNTIME || raw.runtime || "windows_worker";
  if (!["windows_worker", "hosted_worker"].includes(runtime)) throw new Error("runtime must be windows_worker or hosted_worker");
  const deviceId = String(process.env.FEROCITY_FACEBOOK_DEVICE_ID || raw.deviceId || "").trim();
  if (deviceId.length < 16) throw new Error("A paired deviceId is required.");

  const sendEnabled = environmentBoolean(process.env.FEROCITY_FACEBOOK_SEND_ENABLED, raw.sendEnabled === true);
  const expectedProfileId = String(process.env.FEROCITY_FACEBOOK_PROFILE_ID || raw.identity?.expectedProfileId || "").trim();
  if (expectedProfileId && !/^\d{5,30}$/.test(expectedProfileId)) throw new Error("identity.expectedProfileId must be a numeric Facebook profile ID.");
  if (sendEnabled && !expectedProfileId) throw new Error("identity.expectedProfileId is required before sendEnabled can be true.");
  const minimumWriteDelayMs = finiteNumber(raw.actionPolicy?.minimumWriteDelaySeconds, 45, 0, 3600) * 1000;
  const maximumWriteDelayMs = finiteNumber(raw.actionPolicy?.maximumWriteDelaySeconds, 180, 0, 7200) * 1000;
  if (maximumWriteDelayMs < minimumWriteDelayMs) throw new Error("actionPolicy.maximumWriteDelaySeconds must be greater than or equal to minimumWriteDelaySeconds.");

  return {
    configPath,
    root: configRoot,
    apiBase: String(process.env.FEROCITY_CONNECTOR_API_BASE || raw.apiBase || "https://ferocity.live/api/integrations/facebook-connector").replace(/\/$/, ""),
    deviceId,
    deviceName: String(process.env.FEROCITY_FACEBOOK_DEVICE_NAME || raw.deviceName || "Ferocity Marketplace worker").slice(0, 120),
    runtime,
    automationEnabled: environmentBoolean(process.env.FEROCITY_FACEBOOK_AUTOMATION_ENABLED, raw.automationEnabled !== false),
    sendEnabled,
    communityDiscoveryEnabled: environmentBoolean(process.env.FEROCITY_FACEBOOK_DISCOVERY_ENABLED, raw.communityDiscoveryEnabled === true),
    killSwitchFile: path.resolve(configRoot, process.env.FEROCITY_FACEBOOK_KILL_SWITCH_FILE || raw.killSwitchFile || "PAUSE"),
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
      profileDir: path.resolve(configRoot, process.env.FEROCITY_FACEBOOK_PROFILE_DIR || raw.browser?.profileDir || ".facebook-profile"),
      inboxUrl: raw.browser?.inboxUrl || "https://www.facebook.com/messages/requests",
      headless: environmentBoolean(process.env.FEROCITY_FACEBOOK_HEADLESS, raw.browser?.headless === true),
      channel: process.env.FEROCITY_FACEBOOK_BROWSER_CHANNEL || raw.browser?.channel || undefined,
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
