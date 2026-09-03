"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, BellRing, CheckCircle2, LayoutDashboard, Send, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { executeAiWorkforceCommandAction } from "@/app/app/ai-workforce/actions";
import { ferocityGoals, hasUsefulIndustry, moneyCommand, moneyOutcomes, type FerocityGoal } from "@/lib/ai-workforce/guided-conversation";

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

type AttentionItem = {
  title: string;
  detail: string;
  href: string;
  urgency: "critical" | "high" | "medium" | "low";
};

type GuideStep = "idle" | "industry" | "money_outcome" | "ready";

export function FerocityOwnerChat({
  initialCommand,
  sourceEvent,
  industry,
  attentionItems
}: {
  initialCommand: string;
  sourceEvent: SourceEvent | null;
  industry: string | null;
  attentionItems: AttentionItem[];
}) {
  const [command, setCommand] = useState(initialCommand);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [guideStep, setGuideStep] = useState<GuideStep>("idle");
  const [guideIndustry, setGuideIndustry] = useState(hasUsefulIndustry(industry) ? industry!.trim() : "");
  const [guideOwnerMessage, setGuideOwnerMessage] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const [showAttention, setShowAttention] = useState(false);
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
    setGuideStep("idle");
    setGuideMessage("");
    setGuideOwnerMessage("");
  }, [state, submittedCommand]);

  function chooseGoal(goal: FerocityGoal) {
    setGuideOwnerMessage(goal.label);
    if (goal.key === "money") {
      if (hasUsefulIndustry(guideIndustry)) {
        setGuideStep("money_outcome");
        setGuideMessage(`I know this is a ${guideIndustry} business. Where should I focus first?`);
      } else {
        setGuideStep("industry");
        setGuideMessage("First, what kind of business is this—or are you still deciding which industry to enter?");
        setCommand("");
      }
      return;
    }

    setGuideStep("ready");
    setGuideMessage("I can start there. Review the request below, add any detail you want, then send it. I’ll use what the Business Brain already knows instead of making you repeat yourself.");
    setCommand(goal.command);
  }

  function chooseMoneyOutcome(outcome: string) {
    setGuideStep("ready");
    setGuideMessage("Good. I’ll check what is already working, find the strongest opportunities, and prepare the next moves. Review or add detail, then send it.");
    setCommand(moneyCommand(guideIndustry, outcome));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (guideStep === "industry") {
      event.preventDefault();
      const nextIndustry = command.trim();
      if (nextIndustry.length < 2) return;
      setGuideIndustry(nextIndustry);
      setGuideOwnerMessage(`Make more money — ${nextIndustry}`);
      setGuideStep("money_outcome");
      setGuideMessage(`Got it—${nextIndustry}. Which result matters most right now?`);
      setCommand("");
      return;
    }
    setSubmittedCommand(command.trim());
  }

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
          {attentionItems.length ? (
            <button className="ferocity-attention-badge" type="button" onClick={() => setShowAttention((current) => !current)}>
              <BellRing size={14} /> {attentionItems.length} need attention
            </button>
          ) : null}
          <span className="pill"><ShieldCheck size={14} /> Authority rules active</span>
          <Link className="mini-button secondary-button" href="/app">Open workspace</Link>
        </div>
      </header>

      <section className="ferocity-chat-thread" aria-live="polite">
        <article className="ferocity-chat-message ferocity-chat-message-ai">
          <span className="ferocity-chat-avatar"><Sparkles size={18} /></span>
          <div className="ferocity-chat-bubble">
            <strong>What do you want to accomplish?</strong>
            <p>Start with the outcome—not the software. I’ll ask only what I still need, use what Ferocity already knows, and move the work forward.</p>
          </div>
        </article>

        {attentionItems.length ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar ferocity-chat-avatar-attention"><BellRing size={18} /></span>
            <div className="ferocity-chat-bubble">
              <strong>{attentionItems.length} {attentionItems.length === 1 ? "thing needs" : "things need"} your attention.</strong>
              <p>I can give you the short version, open the exact records, or handle the safe parts and bring back only the decisions.</p>
              <div className="button-row">
                <button className="mini-button" type="button" onClick={() => setShowAttention((current) => !current)}>
                  {showAttention ? "Hide details" : "What are they?"}
                </button>
                <button
                  className="mini-button secondary-button"
                  type="button"
                  onClick={() => setCommand("Review everything that needs my attention today. Run every safe, authorized step you can and bring me only the decisions that require me.")}
                >
                  Handle what you can
                </button>
              </div>
              {showAttention ? (
                <ul className="ferocity-attention-list">
                  {attentionItems.map((item) => (
                    <li key={`${item.href}-${item.title}`}>
                      <span className={`status-dot ${item.urgency}`} />
                      <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                      <Link href={item.href}>Open <ArrowRight size={12} /></Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        ) : null}

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

        {guideStep !== "idle" ? (
          <div className="ferocity-chat-exchange">
            <article className="ferocity-chat-message ferocity-chat-message-owner">
              <div className="ferocity-chat-bubble"><p>{guideOwnerMessage}</p></div>
            </article>
            <article className="ferocity-chat-message ferocity-chat-message-ai">
              <span className="ferocity-chat-avatar"><Sparkles size={18} /></span>
              <div className="ferocity-chat-bubble">
                <strong>{guideMessage}</strong>
                {guideStep === "money_outcome" ? (
                  <div className="ferocity-chat-next-choices" aria-label="Choose a growth outcome">
                    {moneyOutcomes.map((outcome) => (
                      <button type="button" key={outcome} onClick={() => chooseMoneyOutcome(outcome)}>{outcome}<ArrowRight size={14} /></button>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
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
                  {turn.href ? <Link className="mini-button" href={turn.href}>Open the right workspace <ArrowRight size={13} /></Link> : null}
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

      {turns.length === 0 && guideStep === "idle" && !command.trim() ? (
        <div className="ferocity-goal-grid" aria-label="Choose what you want to accomplish">
          {ferocityGoals.map((goal) => (
            <button type="button" key={goal.key} onClick={() => chooseGoal(goal)}>
              <strong>{goal.label}</strong>
              <span>{goal.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form
        action={action}
        className="ferocity-chat-composer"
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor="ferocity-owner-command">Ask Ferocity or tell it what to do</label>
        <textarea
          id="ferocity-owner-command"
          name="command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={guideStep === "industry" ? "Example: Roofing, a dental office, or I'm looking for an industry…" : "Ask Ferocity anything or tell it what outcome you want…"}
          minLength={guideStep === "industry" ? 2 : 8}
          maxLength={2000}
          rows={3}
          required
        />
        <button className="button" type="submit" disabled={pending || command.trim().length < (guideStep === "industry" ? 2 : 8)} aria-label="Send to Ferocity">
          <Send size={17} />
        </button>
      </form>
      <div className="ferocity-chat-footer">
        <p className="ferocity-chat-footnote">Ferocity follows your authority settings. Spending, publishing, payments, and other consequential actions still require the approval level you selected.</p>
        <Link href="/app/full"><LayoutDashboard size={13} /> Prefer dashboards? Open the full Command Center.</Link>
      </div>
    </main>
  );
}
