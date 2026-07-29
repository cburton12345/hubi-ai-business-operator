"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Turn = { speaker: "visitor" | "ai"; body: string };

export function ChatExperience({ publicKey, brandName }: { publicKey: string; brandName: string }) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const [turns, setTurns] = useState<Turn[]>([{
    speaker: "ai",
    body: `Hi — I’m Ferocity, the AI receptionist for ${brandName}. What can I help you with?`
  }]);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const body = message.trim();
    if (!body || sending) return;
    setTurns((current) => [...current, { speaker: "visitor", body }]);
    setMessage("");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formPublicKey: publicKey,
          sessionId,
          message: body,
          name: name || undefined,
          email: email || undefined,
          phone: phone || undefined,
          consentToContact: consent
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send.");
      setTurns((current) => [...current, { speaker: "ai", body: result.reply }]);
      setNeedsHuman(Boolean(result.needsHuman));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel form-stack auth-panel">
      <div className="list">
        {turns.map((turn, index) => (
          <div className="list-row" key={`${turn.speaker}-${index}`}>
            <div>
              <small className="pill">{turn.speaker === "ai" ? "Ferocity AI" : "You"}</small>
              <p>{turn.body}</p>
            </div>
          </div>
        ))}
      </div>
      {needsHuman ? <p className="form-error">I’ve flagged this for a person to review. You can also submit the contact form below.</p> : null}
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder="Describe what you need…" />
      <div className="two-col">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, optional" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone, optional" type="tel" />
      </div>
      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email, optional" type="email" />
      <label className="checkbox-row">
        <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
        Save my contact information and allow this business to follow up.
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="button-row">
        <button className="button" disabled={sending || !message.trim()} onClick={send} type="button">{sending ? "Thinking…" : "Send"}</button>
        <Link className="button secondary-button" href={`/book/${publicKey}`}>Request a time</Link>
        <Link className="button secondary-button" href={`/forms/${publicKey}`}>Contact form</Link>
      </div>
      <p className="muted">AI can collect details and route the next step. A person confirms prices, availability, scope, safety, and other important decisions.</p>
    </section>
  );
}
