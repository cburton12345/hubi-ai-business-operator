import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WRITE_ACTIONS = new Set(["request_group_join", "publish_group_post", "send_message", "reply_to_comment", "respond"]);

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function UTCDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeBody(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export class ActionPolicyStore {
  constructor(root, config, clock = () => Date.now()) {
    this.file = path.join(root, "logs", "action-policy.json");
    this.config = config;
    this.clock = clock;
  }

  read() {
    if (!fs.existsSync(this.file)) return { version: 1, completed: [] };
    try {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return { version: 1, completed: Array.isArray(value.completed) ? value.completed : [] };
    } catch (error) {
      return {
        version: 1,
        completed: [],
        invalid: true,
        failureMessage: `The local Facebook action-policy journal could not be read: ${error.message}`
      };
    }
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  prune(state, now = this.clock()) {
    const retentionMs = Math.max(this.config.duplicatePostWindowMs, 7 * 24 * 60 * 60 * 1000);
    state.completed = state.completed
      .filter((entry) => Number.isFinite(Date.parse(entry.completedAt)) && now - Date.parse(entry.completedAt) <= retentionMs)
      .slice(-5000);
    return state;
  }

  assess(action) {
    const now = this.clock();
    const state = this.prune(this.read(), now);
    const actionKey = String(action.actionKey || "send_message");
    if (state.invalid && WRITE_ACTIONS.has(actionKey)) {
      return {
        allowed: false,
        failureCode: "action_policy_state_invalid",
        failureMessage: state.failureMessage || "The local Facebook action-policy journal is invalid."
      };
    }
    const completedToday = state.completed.filter((entry) => UTCDateKey(entry.completedAt) === UTCDateKey(now));

    if (actionKey === "request_group_join") {
      const joinsToday = completedToday.filter((entry) => entry.actionKey === actionKey).length;
      if (joinsToday >= this.config.maxGroupJoinsPerDay) {
        return {
          allowed: false,
          failureCode: "daily_group_join_limit",
          failureMessage: `The local safety limit of ${this.config.maxGroupJoinsPerDay} Facebook group joins per UTC day has been reached.`
        };
      }
    }

    const bodyHash = normalizeBody(action.body) ? digest(normalizeBody(action.body)) : null;
    if (actionKey === "publish_group_post" && bodyHash) {
      const duplicate = state.completed.find((entry) => entry.actionKey === actionKey && entry.bodyHash === bodyHash);
      if (duplicate) {
        return {
          allowed: false,
          failureCode: "duplicate_group_post",
          failureMessage: "The same Facebook group post content was already published within the configured duplicate-content window."
        };
      }
    }

    if (!WRITE_ACTIONS.has(actionKey)) return { allowed: true, waitMs: 0 };
    const lastWrite = [...state.completed].reverse().find((entry) => WRITE_ACTIONS.has(entry.actionKey));
    if (!lastWrite) return { allowed: true, waitMs: 0 };
    const span = Math.max(0, this.config.maximumWriteDelayMs - this.config.minimumWriteDelayMs);
    const seed = Number.parseInt(digest(`${lastWrite.actionId}:${action.id}`).slice(0, 8), 16);
    const requiredDelay = this.config.minimumWriteDelayMs + (span ? seed % (span + 1) : 0);
    const waitMs = Math.max(0, Date.parse(lastWrite.completedAt) + requiredDelay - now);
    return { allowed: true, waitMs };
  }

  recordSuccess(action) {
    const state = this.prune(this.read());
    if (state.completed.some((entry) => entry.actionId === action.id)) return;
    const normalizedBody = normalizeBody(action.body);
    state.completed.push({
      actionId: action.id,
      actionKey: String(action.actionKey || "send_message"),
      target: String(action.sourceUrl || "").slice(0, 2000),
      bodyHash: normalizedBody ? digest(normalizedBody) : null,
      completedAt: new Date(this.clock()).toISOString()
    });
    this.write(this.prune(state));
  }
}
