"use client";

import { useCallback, useEffect, useState } from "react";

type Device = {
  id: string; display_name: string; status: string; app_version: string | null; android_version: string | null;
  battery_percent: number | null; charging: boolean | null; network_type: string | null; last_heartbeat_at: string | null;
  consecutive_failures: number; sims: Array<{ subscriptionId: number; slotIndex: number | null; carrierName: string | null; phoneNumber: string | null; status: string }>;
};
type LatestRelease = { version_name: string; version_code: number; sha256: string };

export function FerocityConnectManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/ferocity-connect/devices", { cache: "no-store" });
    const payload = await response.json() as { devices?: Device[]; latestRelease?: LatestRelease | null; error?: string };
    if (!response.ok) throw new Error(payload.error || "Devices could not be loaded.");
    setDevices(payload.devices ?? []);
    setLatestRelease(payload.latestRelease ?? null);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/ferocity-connect/devices", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { devices?: Device[]; latestRelease?: LatestRelease | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Devices could not be loaded.");
        if (active) { setDevices(payload.devices ?? []); setLatestRelease(payload.latestRelease ?? null); }
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Devices could not be loaded."); });
    return () => { active = false; };
  }, []);

  async function createPairingToken() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/ferocity-connect/pairing-tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { pairingToken?: string; expiresAt?: string; error?: string };
      if (!response.ok || !payload.pairingToken) throw new Error(payload.error || "Pairing token could not be created.");
      setPairingToken(payload.pairingToken); setExpiresAt(payload.expiresAt ?? null);
      setMessage("Open the pairing link on the Android phone. Pairing is single-use and expires in ten minutes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pairing token could not be created."); }
    finally { setBusy(false); }
  }

  async function deviceAction(deviceId: string, action: "activate" | "pause" | "revoke") {
    if (action === "revoke" && !window.confirm("Revoke this device and all of its credentials? This cannot be undone.")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/ferocity-connect/devices/${deviceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, makeDefault: action === "activate" })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Device could not be updated.");
      setMessage(action === "activate" ? "Gateway activated and selected as the default SMS route." : `Gateway ${action}d.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Device could not be updated."); }
    finally { setBusy(false); }
  }

  return <div className="grid">
    <section className="panel span-12 form-stack">
      <div className="list-row flush-row">
        <div><h2>Install Ferocity Connect</h2><p className="muted">Download the signed Android app from this secure workspace link. Android may ask you to allow installation from your browser, then grant the SMS, phone/SIM, and notification permissions Ferocity Connect needs.</p></div>
        <a className="button" href="/api/ferocity-connect/download">Download Android app</a>
      </div>
      <small className="muted">The download link is generated for a signed-in, eligible Ferocity workspace and expires shortly. After installation, return here to create the one-time pairing link.</small>
      {latestRelease ? <small className="muted">Current signed release: {latestRelease.version_name} · SHA-256 {latestRelease.sha256.slice(0, 12).toUpperCase()}…</small> : <small className="muted">No release has been published yet.</small>}
    </section>
    <section className="panel span-12 form-stack">
      <div className="list-row flush-row">
        <div><h2>Pair an Android phone once</h2><p className="muted">The owner-authorized link is single-use and does not reveal workspace credentials. A healthy phone and SIM activate automatically; Ferocity still enforces consent, pacing, health, and emergency controls.</p></div>
        <button className="button" type="button" disabled={busy} onClick={createPairingToken}>{busy ? "Working…" : "Create pairing link"}</button>
      </div>
      {pairingToken ? <code aria-label="Ferocity Connect one-time pairing token">{pairingToken}</code> : null}
      {pairingToken ? <div className="inline-actions"><a className="mini-button" href={`ferocityconnect://pair?token=${encodeURIComponent(pairingToken)}`}>Open in Ferocity Connect</a><button className="mini-button" type="button" onClick={() => navigator.clipboard.writeText(`ferocityconnect://pair?token=${pairingToken}`).then(() => setMessage("Pairing link copied. Open it on the Android phone within ten minutes."))}>Copy pairing link</button></div> : null}
      {expiresAt ? <small className="muted">Expires {new Date(expiresAt).toLocaleString()}</small> : null}
      {message ? <p className="muted" role="status">{message}</p> : null}
    </section>
    {devices.map((device) => <section className="panel span-6 form-stack" key={device.id}>
      <div className="list-row flush-row"><div><h3>{device.display_name}</h3><p className="muted">Android {device.android_version ?? "unknown"} · app {device.app_version ?? "unknown"}</p></div><span className="pill">{device.status.replaceAll("_", " ")}</span></div>
      {latestRelease && device.app_version !== latestRelease.version_name ? <p className="notice warning">Update available: install Ferocity Connect {latestRelease.version_name} using the secure download above. Pairing credentials stay on the device during an in-place update.</p> : null}
      <ul className="list">
        <li className="list-row"><span>Last heartbeat</span><strong>{device.last_heartbeat_at ? new Date(device.last_heartbeat_at).toLocaleString() : "Not yet"}</strong></li>
        <li className="list-row"><span>Device</span><strong>{device.battery_percent ?? "?"}% · {device.network_type ?? "unknown"}</strong></li>
        <li className="list-row"><span>Recent failures</span><strong>{device.consecutive_failures}</strong></li>
        <li className="list-row"><span>SIMs</span><strong>{device.sims.length ? device.sims.map((sim) => `${sim.carrierName ?? "SIM"} ${sim.phoneNumber ?? ""}`).join(", ") : "No available SIM"}</strong></li>
      </ul>
      <div className="inline-actions">
        {device.status !== "active" && device.status !== "revoked" ? <button className="mini-button" disabled={busy || device.sims.length === 0} onClick={() => deviceAction(device.id, "activate")}>Activate & make default</button> : null}
        {device.status === "active" ? <button className="mini-button" disabled={busy} onClick={() => deviceAction(device.id, "pause")}>Pause</button> : null}
        {device.status !== "revoked" ? <button className="mini-button" disabled={busy} onClick={() => deviceAction(device.id, "revoke")}>Revoke</button> : null}
      </div>
    </section>)}
  </div>;
}
