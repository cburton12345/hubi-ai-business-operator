"use client";

import { useState } from "react";

export function FacebookConnectorPairing({ identityId }: { identityId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return <div className="inline-actions">
    <button className="mini-button" type="button" disabled={busy} onClick={createCode}>{busy ? "Creating…" : "Enable controlled test & pair"}</button>
    {code ? <code aria-label="Facebook connector pairing code">{code}</code> : null}
    {message ? <small className="muted">{message}</small> : null}
  </div>;
}
