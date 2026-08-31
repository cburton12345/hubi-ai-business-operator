"use client";

import { useCallback, useEffect, useState } from "react";

type ConnectorDevice = {
  id: string; name: string; status: string; connectorVersion?: string | null;
  expiresAt: string; lastSeenAt?: string | null;
};

export function FacebookConnectorPairing({ identityId }: { identityId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<ConnectorDevice[]>([]);

  const loadDevices = useCallback(async () => {
    const response = await fetch(`/api/integrations/facebook-connector/sessions?identityId=${encodeURIComponent(identityId)}`, { cache: "no-store" });
    const payload = await response.json() as { devices?: ConnectorDevice[] };
    if (response.ok) setDevices(payload.devices ?? []);
  }, [identityId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/integrations/facebook-connector/sessions?identityId=${encodeURIComponent(identityId)}`, {
      cache: "no-store", signal: controller.signal
    }).then(async (response) => ({ response, payload: await response.json() as { devices?: ConnectorDevice[] } }))
      .then(({ response, payload }) => { if (response.ok) setDevices(payload.devices ?? []); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Connector devices could not be loaded."); });
    return () => controller.abort();
  }, [identityId]);

  async function createCode() {
    setBusy(true); setMessage(null); setCode(null);
    try {
      const response = await fetch("/api/integrations/facebook-connector/pairing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId, enableControlledTest: true })
      });
      const payload = await response.json() as { code?: string; error?: string };
      if (!response.ok || !payload.code) throw new Error(payload.error || "Pairing code could not be created.");
      setCode(payload.code); setMessage("Single use · expires in 10 minutes");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing code could not be created.");
    } finally { setBusy(false); }
  }

  async function revoke(sessionId: string) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/integrations/facebook-connector/sessions", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityId, sessionId })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Connector device could not be revoked.");
      setMessage("Connector device revoked.");
      await loadDevices();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connector device could not be revoked.");
    } finally { setBusy(false); }
  }

  return <div>
    <div className="inline-actions">
      <a className="mini-button" href="/downloads/ferocity-facebook-connector-0.1.0.zip" download>Download connector</a>
      <button className="mini-button" type="button" disabled={busy} onClick={createCode}>{busy ? "Creating…" : "Create pairing code"}</button>
      {code ? <code aria-label="Facebook connector pairing code">{code}</code> : null}
      {message ? <small className="muted">{message}</small> : null}
    </div>
    <p className="muted">Starts in observe mode. Ferocity may prepare replies, but nothing is sent until your workspace approves sending.</p>
    {devices.length ? <ul className="list compact-list" aria-label="Paired Facebook connector devices">
      {devices.map((device) => <li key={device.id}>
        <span>{device.name} · {device.status}{device.lastSeenAt ? ` · last seen ${new Date(device.lastSeenAt).toLocaleString()}` : ""}</span>
        {device.status === "active" ? <button className="mini-button" type="button" disabled={busy} onClick={() => void revoke(device.id)}>Revoke</button> : null}
      </li>)}
    </ul> : null}
  </div>;
}
