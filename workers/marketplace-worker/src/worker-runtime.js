import fs from "node:fs";
import { assertMarketplaceWorkerContract } from "./worker-contract.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeConfirmation(action, result) {
  return {
    actionId: action.id,
    outcome: result.outcome,
    providerReference: result.providerReference,
    failureCode: result.failureCode,
    failureMessage: result.failureMessage,
    observedUrl: result.observedUrl
  };
}

export class MarketplaceWorkerRuntime {
  constructor({ client, adapter, journal, actionPolicy, logger, config, clock = () => Date.now(), delay = sleep }) {
    if (!actionPolicy || typeof actionPolicy.assess !== "function" || typeof actionPolicy.recordSuccess !== "function") {
      throw new Error("A durable Facebook action policy is required.");
    }
    this.client = client;
    this.adapter = assertMarketplaceWorkerContract(adapter);
    this.journal = journal;
    this.actionPolicy = actionPolicy;
    this.logger = logger;
    this.config = config;
    this.clock = clock;
    this.delay = delay;
    this.nextSweepAt = 0;
    this.nextCommunitySweepAt = 0;
    this.lastActivityAt = 0;
    this.lastHealthAt = 0;
    this.lastHealthKey = "";
    this.attentionSince = null;
    this.backoffUntil = 0;
    this.failureDelay = config.scheduling.restartDelayMs;
  }

  isPaused() {
    if (this.config.automationEnabled === false) return true;
    if (!this.config.killSwitchFile) return false;
    try {
      return fs.existsSync(this.config.killSwitchFile);
    } catch {
      return true;
    }
  }

  async recoverJournal() {
    for (const entry of this.journal.read()) {
      let confirmation = entry.confirmation;
      if (entry.phase === "executing") {
        confirmation = {
          actionId: entry.action.id,
          outcome: "blocked",
          failureCode: "worker_interrupted_during_send",
          failureMessage: "The worker stopped during a send attempt. Ferocity blocked automatic retry to prevent a duplicate message."
        };
      }
      if (!confirmation) continue;
      await this.client.confirmAction(confirmation);
      this.journal.remove(entry.action.id);
      this.logger.warn("Recovered an interrupted action without duplicating it.", { actionId: entry.action.id, outcome: confirmation.outcome });
    }
  }

  async reportHealth(health, runtimeState, force = false) {
    const now = this.clock();
    const key = `${health.state}:${health.browserState}:${runtimeState}:${health.reason}`;
    if (!force && key === this.lastHealthKey && now - this.lastHealthAt < this.config.scheduling.healthReportMs) return;
    await this.client.reportHealth({ ...health, runtimeState });
    this.lastHealthAt = now;
    this.lastHealthKey = key;
  }

  async stopBrowser(reason) {
    if (!this.adapter.isRunning()) return;
    await this.adapter.stop();
    this.logger.info("Browser stopped.", { reason });
    await this.reportHealth(await this.adapter.inspectHealth(), "idle", true).catch(() => {});
  }

  async startBrowser(reason) {
    if (this.adapter.isRunning()) return true;
    if (this.clock() < this.backoffUntil) return false;
    try {
      this.logger.info("Starting persistent Facebook browser.", { reason });
      await this.adapter.start();
      this.failureDelay = this.config.scheduling.restartDelayMs;
      this.lastActivityAt = this.clock();
      return true;
    } catch (error) {
      this.backoffUntil = this.clock() + this.failureDelay;
      this.failureDelay = Math.min(this.config.scheduling.maxRestartDelayMs, Math.round(this.failureDelay * 1.7));
      this.logger.error("Browser start failed; worker will retry.", { error: error.message, retryAt: new Date(this.backoffUntil).toISOString() });
      return false;
    }
  }

  async processOneAction() {
    if (!this.config.sendEnabled) return false;
    const response = await this.client.claimAction();
    const action = response.action;
    if (!action) return false;
    this.journal.begin(action);
    let result;
    const policy = this.actionPolicy.assess(action);
    if (!policy.allowed) {
      result = { outcome: "blocked", failureCode: policy.failureCode, failureMessage: policy.failureMessage };
    } else {
      if (policy.waitMs > 0) {
        this.logger.info("Applying Facebook write pacing before the approved action.", { actionId: action.id, waitMs: policy.waitMs });
        await this.delay(policy.waitMs);
      }
      if (this.isPaused()) {
        result = { outcome: "blocked", failureCode: "local_kill_switch", failureMessage: "The local Facebook worker kill switch was activated before execution." };
      } else {
        try {
          result = await this.adapter.executeAction(action);
        } catch (error) {
          result = { outcome: "failed", failureCode: "worker_execution_error", failureMessage: error.message };
        }
      }
    }
    const confirmation = normalizeConfirmation(action, result);
    this.journal.complete(action, confirmation);
    await this.client.confirmAction(confirmation);
    if (confirmation.outcome === "succeeded") this.actionPolicy.recordSuccess(action);
    this.journal.remove(action.id);
    this.lastActivityAt = this.clock();
    this.logger.info("Action processed.", { actionId: action.id, outcome: confirmation.outcome });
    return true;
  }

  async tick() {
    await this.recoverJournal();
    const now = this.clock();
    if (this.isPaused()) {
      await this.stopBrowser("local_kill_switch");
      await this.reportHealth({
        state: "warning",
        browserState: "closed",
        url: this.config.browser.inboxUrl,
        reason: "The local Facebook worker kill switch is active."
      }, "idle", true);
      return;
    }
    const pending = this.config.sendEnabled ? await this.client.pendingAction() : { hasPendingAction: false };
    const sweepDue = now >= this.nextSweepAt;
    const communitySweepDue = this.config.communityDiscoveryEnabled && now >= this.nextCommunitySweepAt;
    if (!this.adapter.isRunning() && (pending.hasPendingAction || sweepDue || communitySweepDue)) {
      const reason = pending.hasPendingAction ? "approved_action_ready" : communitySweepDue ? "scheduled_community_sweep" : "scheduled_inbound_sweep";
      const started = await this.startBrowser(reason);
      if (!started) return;
    }

    if (!this.adapter.isRunning()) {
      await this.reportHealth(await this.adapter.inspectHealth(), now < this.backoffUntil ? "backoff" : "idle");
      return;
    }

    const health = await this.adapter.inspectHealth();
    await this.reportHealth(health, "running");
    if (health.state !== "ready") {
      if (!this.attentionSince) this.attentionSince = now;
      if (now - this.attentionSince >= this.config.scheduling.manualAttentionTimeoutMs) {
        await this.stopBrowser("manual_attention_timeout");
        this.nextSweepAt = now + this.config.scheduling.inboundSweepMs;
      }
      return;
    }
    this.attentionSince = null;

    let workPerformed = false;
    if (sweepDue) {
      const observations = await this.adapter.collectObservations();
      for (const observation of observations) await this.client.observe(observation);
      this.nextSweepAt = now + this.config.scheduling.inboundSweepMs;
      workPerformed = observations.length > 0;
      if (workPerformed) this.logger.info("Inbound sweep recorded messages.", { count: observations.length });
    }
    if (communitySweepDue) {
      const plan = await this.client.communityDiscoveryPlan();
      const communities = await this.adapter.collectCommunitySnapshots(plan);
      for (const community of communities) await this.client.observeCommunity(community);
      this.nextCommunitySweepAt = now + this.config.scheduling.communitySweepMs;
      workPerformed = communities.length > 0 || workPerformed;
      if (communities.length > 0) this.logger.info("Facebook community sweep recorded groups and rules.", { count: communities.length });
    }
    if (pending.hasPendingAction) workPerformed = await this.processOneAction() || workPerformed;
    if (workPerformed) this.lastActivityAt = now;

    if (!pending.hasPendingAction && now - this.lastActivityAt >= this.config.scheduling.idleTimeoutMs) {
      await this.stopBrowser("idle_timeout");
    }
  }

  async run(signal) {
    await this.recoverJournal();
    while (!signal.aborted) {
      try {
        await this.tick();
      } catch (error) {
        this.logger.error("Worker cycle failed; browser will be recycled.", { error: error.message });
        await this.stopBrowser("cycle_failure").catch(() => {});
        this.backoffUntil = this.clock() + this.failureDelay;
        this.failureDelay = Math.min(this.config.scheduling.maxRestartDelayMs, Math.round(this.failureDelay * 1.7));
      }
      await Promise.race([sleep(this.config.scheduling.controlPollMs), new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))]);
    }
    await this.stopBrowser("worker_shutdown");
  }
}
