"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Send, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { executeAiWorkforceCommandAction } from "@/app/app/ai-workforce/actions";

type ChatTurn = {
  id: string;
  command: string;
  message: string;
  prepared: string[];
  blocked: string[];
  href?: string;
  runId?: string;
};

type SourceEvent = {
  platformName: string;
  title: string;
  summary: string;
  severity: string;
  recommendedAction: string | null;
};

const suggestions = [
  "What needs my attention today?",
  "Follow up with estimates that are losing momentum.",
  "What should happen next to grow the business?"
];

export function FerocityOwnerChat({ initialCommand, sourceEvent }: { initialCommand: string; sourceEvent: SourceEvent | null }) {
  const [command, setCommand] = useState(initialCommand);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [submittedCommand, setSubmittedCommand] = useState("");
  const recordedResponse = useRef<string | null>(null);
  const [state, action, pending] = useActionState(executeAiWorkforceCommandAction, { ok: false });

  useEffect(() => {
    if (!submittedCommand || !state.message) return;
    const responseKey = `${submittedCommand}:${state.runId ?? state.href ?? state.message}`;
    if (recordedResponse.current === responseKey) return;
    recordedResponse.current = responseKey;
    setTurns((current) => [
      ...current,
      {
        id: responseKey,
        command: submittedCommand,
        message: state.message ?? "Ferocity finished reviewing the request.",
        prepared: state.prepared ?? [],
        blocked: state.blocked ?? [],
        href: state.href,
        runId: state.runId
      }
    ]);
    setCommand("");
  }, [state, submittedCommand]);

  return (
    <main className="ferocity-chat-shell">
      <header className="ferocity-chat-header">
        <div className="ferocity-chat-identity">
          <span className="ferocity-chat-avatar"><Sparkles size={20} /></span>
          <div>
            <p className="eyebrow">Your AI operations department</p>
            <h1>Ferocity</h1>
          </div>
        </div>
        <div className="ferocity-chat-header-actions">
          <span className="pill"><ShieldCheck size={14} /> Authority rules active</span>
          <Link className="mini-button secondary-button" href="/app">Open workspace</Link>
        </div>
      </header>

      <section className="ferocity-chat-thread" aria-live="polite">
        <article className="ferocity-chat-message ferocity-chat-message-ai">
          <span className="ferocity-chat-avatar"><Sparkles size={18} /></span>
          <div className="ferocity-chat-bubble">
            <strong>What would you like me to handle?</strong>
            <p>Ask about the business, approve work, change a plan, or tell me the outcome you want. I’ll find the right systems and only stop for decisions that truly need you.</p>
          </div>
        </article>

        {sourceEvent ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar"><TriangleAlert size={18} /></span>
            <div className="ferocity-chat-bubble">
              <p className="eyebrow">{sourceEvent.platformName} · {sourceEvent.severity}</p>
              <strong>{sourceEvent.title}</strong>
              <p>{sourceEvent.summary}</p>
              {sourceEvent.recommendedAction ? <p><strong>Suggested next step:</strong> {sourceEvent.recommendedAction}</p> : null}
            </div>
          </article>
        ) : null}

        {turns.map((turn) => (
          <div className="ferocity-chat-exchange" key={turn.id}>
            <article className="ferocity-chat-message ferocity-chat-message-owner">
              <div className="ferocity-chat-bubble"><p>{turn.command}</p></div>
            </article>
            <article className="ferocity-chat-message ferocity-chat-message-ai">
              <span className="ferocity-chat-avatar"><Sparkles size={18} /></span>
              <div className="ferocity-chat-bubble">
                <strong>{turn.message}</strong>
                {turn.prepared.length ? (
                  <ul className="ferocity-chat-result-list">
                    {turn.prepared.map((item) => <li key={item}><CheckCircle2 size={15} /> {item}</li>)}
                  </ul>
                ) : null}
                {turn.blocked.length ? (
                  <ul className="ferocity-chat-result-list ferocity-chat-result-blocked">
                    {turn.blocked.map((item) => <li key={item}><TriangleAlert size={15} /> {item}</li>)}
                  </ul>
                ) : null}
                <div className="button-row">
                  {turn.href ? <Link className="mini-button" href={turn.href}>Open answer <ArrowRight size={13} /></Link> : null}
                  {turn.runId ? <Link className="mini-button secondary-button" href={`/app/ai-workforce/results/${turn.runId}`}>Review details</Link> : null}
                </div>
              </div>
            </article>
          </div>
        ))}

        {pending ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar"><Sparkles size={18} /></span>
            <div className="ferocity-chat-bubble ferocity-chat-thinking">Ferocity is checking the business and preparing the next action…</div>
          </article>
        ) : null}
      </section>

      {turns.length === 0 ? (
        <div className="ferocity-chat-suggestions" aria-label="Suggested requests">
          {suggestions.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}</button>
          ))}
        </div>
      ) : null}

      <form
        action={action}
        className="ferocity-chat-composer"
        onSubmit={() => setSubmittedCommand(command.trim())}
      >
        <label className="sr-only" htmlFor="ferocity-owner-command">Ask Ferocity or tell it what to do</label>
        <textarea
          id="ferocity-owner-command"
          name="command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Ask Ferocity anything or tell it what to do…"
          minLength={8}
          maxLength={2000}
          rows={3}
          required
        />
        <button className="button" type="submit" disabled={pending || command.trim().length < 8} aria-label="Send to Ferocity">
          <Send size={17} />
        </button>
      </form>
      <p className="ferocity-chat-footnote">Ferocity follows your authority settings. Spending, publishing, payments, and other consequential actions still require the approval level you selected.</p>
    </main>
  );
}
