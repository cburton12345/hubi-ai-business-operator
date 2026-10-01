"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicPlatform } from "@/lib/public-site/platform-catalog";

type Turn = {
  speaker: "visitor" | "ai";
  body: string;
  callToAction?: { href: string; label: string };
  recommendations?: Array<{ key: string; name: string; outcome: string; href: string }>;
};

type ChatExperienceProps = {
  publicKey: string;
  brandName: string;
  experience?: "business_receptionist" | "ferocity_sales";
  platform?: PublicPlatform | null;
  initialContext?: { businessType?: string; bottleneck?: string };
};

const salesPrompts = [
  "Help me find the biggest bottleneck in my business.",
  "I want to grow without adding more chaos. Where would you start?",
  "What can Ferocity improve without replacing all my current tools?"
];

function addChatContinuation(href: string, sessionId: string) {
  const [path, hash = ""] = href.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}chatSession=${encodeURIComponent(sessionId)}${hash ? `#${hash}` : ""}`;
}

export function ChatExperience({
  publicKey,
  brandName,
  experience = "business_receptionist",
  platform = null,
  initialContext
}: ChatExperienceProps) {
  const contextSentence = [initialContext?.businessType, initialContext?.bottleneck].filter(Boolean).join(" · ");
  const openingTurn = useMemo<Turn>(() => ({
    speaker: "ai",
    body: experience === "ferocity_sales"
      ? platform
        ? `You’re looking at ${platform.name}. Tell me what kind of business you run and what feels slow, gets dropped, depends too much on you, or needs to grow. I’ll explain whether this is the right fit and what Ferocity would do first.`
        : contextSentence
          ? `I have your starting point: ${contextSentence}. Tell me a little more about what is happening now, and I’ll identify the first practical moves Ferocity would make.`
          : "What kind of business do you run? Tell me what feels slow, gets dropped, depends too much on you, what is missing, or what you most want to grow. I’ll map the first practical improvements, explain what Ferocity could handle or build, and show the simplest way to start."
      : `Hi — I’m Ferocity, the AI receptionist for ${brandName}. What can I help you with?`
  }), [brandName, contextSentence, experience, platform]);
  const storageKey = useMemo(
    () => `ferocity-public-chat:${experience}:${publicKey}`,
    [experience, publicKey]
  );
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<Turn[]>([openingTurn]);
  const [storageReady, setStorageReady] = useState(false);
  const [message, setMessage] = useState(contextSentence ? `Here is more context about ${contextSentence}: ` : "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadCaptureOpen, setLeadCaptureOpen] = useState(false);
  const [capturingLead, setCapturingLead] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [serverClosed, setServerClosed] = useState(false);
  const [error, setError] = useState("");
  const visitorMessageCount = turns.filter((turn) => turn.speaker === "visitor").length;
  const hasDiagnosticReply = turns.filter((turn) => turn.speaker === "ai").length > 1;
  const chatClosed = experience === "ferocity_sales" && (serverClosed || visitorMessageCount >= 8);
  const guidedStartHref = addChatContinuation(
    platform?.startHref ?? "/start?source=ask_ferocity#start-request",
    sessionId
  );

  useEffect(() => {
    let cancelled = false;
    let restoredSessionId: string | null = null;
    let restoredTurns: Turn[] | null = null;
    let restoredLeadCaptured = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { sessionId?: unknown; turns?: unknown; savedAt?: unknown; leadCaptured?: unknown };
        const stillCurrent = typeof saved.savedAt === "number" && Date.now() - saved.savedAt < 30 * 24 * 60 * 60 * 1000;
        const safeTurns = Array.isArray(saved.turns)
          ? saved.turns.filter((turn): turn is Turn => Boolean(
              turn && typeof turn === "object" &&
              ((turn as Turn).speaker === "visitor" || (turn as Turn).speaker === "ai") &&
              typeof (turn as Turn).body === "string"
            )).slice(-24)
          : [];
        if (stillCurrent && typeof saved.sessionId === "string" && safeTurns.length > 0) {
          restoredSessionId = saved.sessionId;
          restoredTurns = safeTurns;
          restoredLeadCaptured = saved.leadCaptured === true;
        }
      }
    } catch {}
    queueMicrotask(() => {
      if (cancelled) return;
      if (restoredSessionId && restoredTurns) {
        setSessionId(restoredSessionId);
        setTurns(restoredTurns);
        setLeadCaptured(restoredLeadCaptured);
      }
      setStorageReady(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, turns: turns.slice(-24), leadCaptured, savedAt: Date.now() }));
  }, [leadCaptured, sessionId, storageKey, storageReady, turns]);

  function startOver() {
    localStorage.removeItem(storageKey);
    setSessionId(crypto.randomUUID());
    setTurns([openingTurn]);
    setMessage(contextSentence ? `Here is more context about ${contextSentence}: ` : "");
    setName("");
    setEmail("");
    setPhone("");
    setConsent(false);
    setNeedsHuman(false);
    setLeadCaptured(false);
    setLeadCaptureOpen(false);
    setCaptureError("");
    setServerClosed(false);
    setError("");
  }

  async function captureLead() {
    if (capturingLead || leadCaptured) return;
    if (!email.trim() && !phone.trim()) {
      setCaptureError("Enter an email or phone number so Ferocity can keep the plan connected to you.");
      return;
    }
    if (!consent) {
      setCaptureError("Confirm that Ferocity may follow up before saving the plan.");
      return;
    }

    setCapturingLead(true);
    setCaptureError("");
    try {
      const response = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formPublicKey: publicKey,
          source: "website_chat",
          sourceDetail: "ferocity_public_diagnostic_plan",
          website: "",
          submittedAt: new Date().toISOString(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          message: "Visitor asked Ferocity to save the public business diagnosis and help continue the setup.",
          leadType: "demo",
          consentToContact: true,
          utm: {},
          details: {
            chatSessionId: sessionId,
            experience,
            platformContextKey: platform?.key ?? null,
            diagnosticTranscript: turns.slice(-8).map((turn) => ({
              speaker: turn.speaker,
              body: turn.body.slice(0, 800)
            }))
          }
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the plan.");
      setLeadCaptured(true);
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : "Unable to save the plan.");
    } finally {
      setCapturingLead(false);
    }
  }

  async function send() {
    const body = message.trim();
    if (!body || sending || chatClosed) return;
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
          consentToContact: consent,
          experience,
          platformContextKey: platform?.key
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send.");
      setTurns((current) => [...current, {
        speaker: "ai",
        body: result.reply,
        recommendations: Array.isArray(result.recommendations) ? result.recommendations.slice(0, 3) : undefined,
        callToAction: result.chatClosed
          ? { href: result.plansUrl || "/pricing", label: "View plans" }
          : undefined
      }]);
      setNeedsHuman(Boolean(result.needsHuman));
      setLeadCaptured((current) => current || Boolean(result.leadCaptured));
      setServerClosed(Boolean(result.chatClosed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={`panel form-stack auth-panel${experience === "ferocity_sales" ? " ferocity-sales-chat" : ""}`}>
      {experience === "ferocity_sales" ? (
        <header className="ferocity-chat-header">
          <div className="ferocity-chat-identity">
            <Image className="ferocity-chat-avatar" src="/ferocity-lion-brand.png" alt="" width={46} height={46} priority />
            <div>
              <strong>FEROCITY</strong>
              <span>Business operator</span>
            </div>
          </div>
          <span className="ferocity-chat-status"><i aria-hidden="true" /> Online</span>
        </header>
      ) : null}
      <div className="list ferocity-chat-transcript" aria-live="polite">
        {turns.map((turn, index) => (
          <div className={`list-row ferocity-chat-turn ${turn.speaker === "ai" ? "is-ferocity" : "is-visitor"}`} key={`${turn.speaker}-${index}`}>
            <div>
              <small className="pill">{turn.speaker === "ai" ? "Ferocity" : "You"}</small>
              <p>{turn.body}</p>
              {turn.recommendations?.length ? (
                <div className="button-row" aria-label="Relevant Ferocity capabilities">
                  {turn.recommendations.map((recommendation) => (
                    <Link className="mini-button secondary-button" href={recommendation.href} key={recommendation.key} title={recommendation.outcome}>
                      Explore {recommendation.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              {turn.callToAction ? <Link className="button secondary-button" href={turn.callToAction.href}>{turn.callToAction.label}</Link> : null}
            </div>
          </div>
        ))}
      </div>
      {needsHuman ? <p className="form-error">I’ve flagged this for a person to review. You can also submit the contact form below.</p> : null}
      {experience === "ferocity_sales" && turns.length === 1 ? (
        <div className="button-row" aria-label="Suggested questions">
          {salesPrompts.map((prompt) => (
            <button className="mini-button secondary-button" key={prompt} onClick={() => setMessage(prompt)} type="button">
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      {chatClosed ? (
        <section className="ferocity-chat-captured" role="status">
          <strong>You reached the end of this public conversation.</strong>
          <span>View plans when you are ready to continue with connected business context, or start a fresh conversation about something else.</span>
          <button className="mini-button secondary-button" onClick={startOver} type="button">Start a new conversation</button>
        </section>
      ) : null}
      <textarea disabled={chatClosed} value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder={chatClosed ? "Start a new conversation to keep asking Ferocity" : experience === "ferocity_sales" ? "Tell me about the business and what you want to improve…" : "Describe what you need…"} />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="button-row ferocity-chat-actions">
        <button className="button" disabled={chatClosed || sending || !message.trim()} onClick={send} type="button">{sending ? "Thinking…" : chatClosed ? "Conversation complete" : "Send"}</button>
        {experience === "ferocity_sales" ? (
          <>
            <Link className="button secondary-button" href="/">Home</Link>
            <Link className="button secondary-button" href="/pricing">Plans</Link>
            <Link className="button secondary-button" href={guidedStartHref}>Get started</Link>
          </>
        ) : (
          <>
            <Link className="button secondary-button" href={`/book/${publicKey}`}>Request a time</Link>
            <Link className="button secondary-button" href={`/forms/${publicKey}`}>Contact form</Link>
          </>
        )}
      </div>
      {experience === "ferocity_sales" && hasDiagnosticReply && !leadCaptured ? (
        <section className={`ferocity-chat-contact ferocity-chat-lead-capture${leadCaptureOpen ? " is-open" : ""}`}>
          <div>
            <strong>Continue with this plan.</strong>
            <p>Save the conversation and Ferocity can pick up from this diagnosis instead of making you repeat it.</p>
          </div>
          <button className="mini-button secondary-button ferocity-chat-capture-toggle" onClick={() => setLeadCaptureOpen((current) => !current)} type="button" aria-expanded={leadCaptureOpen}>
            {leadCaptureOpen ? "Hide" : "Continue with my plan"}
          </button>
          {leadCaptureOpen ? <div className="form-stack ferocity-chat-capture-fields">
            <div className="two-col">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, optional" />
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone, optional" type="tel" />
            </div>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email, optional" type="email" />
            <label className="checkbox-row">
              <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
              Save my contact information and allow Ferocity to follow up.
            </label>
            {captureError ? <p className="form-error">{captureError}</p> : null}
            <button className="button" disabled={capturingLead || (!email.trim() && !phone.trim())} onClick={captureLead} type="button">
              {capturingLead ? "Saving…" : "Save my plan"}
            </button>
          </div> : null}
        </section>
      ) : experience === "ferocity_sales" && leadCaptured ? (
        <section className="ferocity-chat-captured" role="status">
          <strong>Your plan is connected.</strong>
          <span>Ferocity has your contact and this chat session, so the follow-up can continue from what you already shared.</span>
          <Link className="button secondary-button" href={guidedStartHref}>Continue guided setup</Link>
        </section>
      ) : experience !== "ferocity_sales" ? (
        <>
          <div className="two-col">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, optional" />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone, optional" type="tel" />
          </div>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email, optional" type="email" />
          <label className="checkbox-row">
            <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
            Save my contact information and allow this business to follow up.
          </label>
        </>
      ) : null}
      {experience === "ferocity_sales" ? (
        <div className="button-row">
          {turns.length > 1 ? <button className="mini-button secondary-button" onClick={startOver} type="button">Start over</button> : null}
          <span className="muted">This browser remembers the conversation for 30 days.</span>
        </div>
      ) : null}
      <p className="muted">{experience === "ferocity_sales"
        ? "Ask naturally. Ferocity uses public product information and can guide you to a different starting path when it fits better. Provider usage and third-party costs stay separate where stated."
        : "AI can collect details and route the next step. A person confirms prices, availability, scope, safety, and other important decisions."}</p>
    </section>
  );
}
