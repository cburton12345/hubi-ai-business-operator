export class FerocityConnectorClient {
  constructor({ apiBase, token, deviceId, version = "marketplace-worker-0.4.0", runtime = "windows_worker" }) {
    this.apiBase = apiBase.replace(/\/$/, "");
    this.token = token;
    this.deviceId = deviceId;
    this.version = version;
    this.runtime = runtime;
  }

  async request(path, payload = {}) {
    const response = await fetch(`${this.apiBase}/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
        "x-ferocity-device-id": this.deviceId
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Ferocity request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  pendingAction() {
    return this.request("action/pending");
  }

  claimAction() {
    return this.request("action/claim");
  }

  observe(observation) {
    return this.request("observe", observation);
  }

  observeCommunity(observation) {
    return this.request("community/observe", observation);
  }

  communityDiscoveryPlan() {
    return this.request("community/discovery-plan");
  }

  confirmAction(result) {
    return this.request("action/confirm", result);
  }

  reportHealth({ state, reason, providerCode, url, runtimeState, browserState }) {
    return this.request("health", {
      state,
      reason,
      providerCode,
      url,
      connectorVersion: this.version,
      transportType: this.runtime,
      runtimeState,
      browserState
    });
  }
}

export async function pairWorker({ apiBase, code, deviceId, deviceName, runtime = "windows_worker" }) {
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      deviceId,
      deviceName,
      connectorVersion: "marketplace-worker-0.4.0",
      transportType: runtime
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.token) throw new Error(data.error || `Pairing failed (${response.status})`);
  return data;
}
