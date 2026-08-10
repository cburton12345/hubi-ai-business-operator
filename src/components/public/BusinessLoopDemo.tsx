"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Megaphone,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon
} from "lucide-react";

type DemoStage = {
  department: string;
  time: string;
  title: string;
  signal: string;
  action: string;
  result: string;
  human: string;
  humanNeeded: boolean;
  evidence: string[];
  icon: LucideIcon;
};

const stages: DemoStage[] = [
  {
    department: "Growth",
    time: "7:42 AM",
    title: "Marketing creates the opportunity",
    signal: "Yesterday’s completed roof and customer-approved photos are strong proof for this week’s storm campaign.",
    action: "The Growth team prepares channel-ready creative, updates the local search plan, and publishes only through connected channels with authority and budget remaining.",
    result: "A homeowner clicks the tracked campaign and starts a conversation. Source, offer, creative, and cost stay attached to the opportunity.",
    human: "No interruption — the campaign is inside the approved plan and budget.",
    humanNeeded: false,
    evidence: ["Source attached", "Budget checked", "Consent-safe proof"],
    icon: Megaphone
  },
  {
    department: "Reception",
    time: "8:14 PM",
    title: "The lead is answered after hours",
    signal: "A new homeowner asks about an active roof leak while the office is closed.",
    action: "The AI receptionist answers, confirms the service area, captures urgency and contact preference, and checks the shared customer history.",
    result: "A qualified emergency lead enters one customer record instead of becoming a voicemail someone must remember tomorrow.",
    human: "No interruption — qualification follows the company’s saved rules.",
    humanNeeded: false,
    evidence: ["Lead qualified", "Consent recorded", "History checked"],
    icon: UsersRound
  },
  {
    department: "Sales",
    time: "8:17 PM",
    title: "The estimate starts taking shape",
    signal: "The customer’s answers and uploaded damage photos match an emergency repair playbook.",
    action: "The Estimator pulls the right pricebook items, prepares scope questions, and offers appointment windows that Operations can actually support.",
    result: "The customer receives the next useful step while the estimate, appointment, and original conversation keep the same context.",
    human: "No interruption — the draft remains inside pricing and margin guardrails.",
    humanNeeded: false,
    evidence: ["Pricebook applied", "Margin protected", "Draft traceable"],
    icon: Sparkles
  },
  {
    department: "Operations",
    time: "Next morning",
    title: "The right crew and materials line up",
    signal: "The preferred appointment overlaps another route, and one required material is below the saved truck-stock minimum.",
    action: "Dispatch compares crew skills, location, workload, customer timing, inventory, and supplier availability before proposing the best sequence.",
    result: "The visit is scheduled, the customer is updated, and purchasing receives the exact shortage instead of a vague reminder.",
    human: "One decision — approve the alternate crew because overtime exceeds the saved limit.",
    humanNeeded: true,
    evidence: ["Skills matched", "Route checked", "Exception explained"],
    icon: BrainCircuit
  },
  {
    department: "Field",
    time: "On the job",
    title: "The job updates itself from the field",
    signal: "Arrival, time, photos, forms, installed materials, and a hidden-deck condition change the original plan.",
    action: "Ferocity updates Job Health, drafts the change order with supporting evidence, and keeps the schedule, customer promise, and expected margin in sync.",
    result: "The office sees the real job—not yesterday’s version—and the crew keeps moving without entering the same facts in multiple systems.",
    human: "No interruption for routine updates; the protected change order follows its approval rule.",
    humanNeeded: false,
    evidence: ["Field proof attached", "Cost updated", "Promise monitored"],
    icon: ShieldCheck
  },
  {
    department: "Finance",
    time: "Completion",
    title: "Completed work becomes collected revenue",
    signal: "Required photos, signatures, labor, materials, and completion checks are present.",
    action: "Finance prepares the invoice and payment path, records job cost and expected profit, and schedules only the follow-up the account actually needs.",
    result: "The customer gets an easy way to pay while invoice state, provider fees, collections, and reporting remain connected.",
    human: "No interruption — the invoice matches approved work and payment authority.",
    humanNeeded: false,
    evidence: ["Completion verified", "Invoice prepared", "Profit updated"],
    icon: CircleDollarSign
  },
  {
    department: "Reputation",
    time: "After payment",
    title: "A good outcome compounds",
    signal: "The payment cleared, the customer had no unresolved service issue, and the review window is appropriate.",
    action: "The Customer team sends the preferred review or referral request, while service-recovery rules prevent an awkward public ask when something is wrong.",
    result: "The completed job becomes trust, referral potential, and permissioned proof for the next growth cycle.",
    human: "No interruption — eligibility, consent, and customer preference all passed.",
    humanNeeded: false,
    evidence: ["Eligibility passed", "Preference honored", "Recovery safeguard"],
    icon: CheckCircle2
  },
  {
    department: "Business Brain",
    time: "The loop continues",
    title: "The whole business learns from the result",
    signal: "The campaign source, response, estimate, job cost, payment, and customer outcome now form one complete operating history.",
    action: "Ferocity updates source-to-revenue reporting, future recommendations, the Daily Brief, and the next authorized growth move.",
    result: "The business does not merely store the completed job. It uses the outcome to make the next decision better.",
    human: "Only the decisions outside saved authority return to the owner.",
    humanNeeded: false,
    evidence: ["Revenue attributed", "Memory updated", "Next move prepared"],
    icon: BrainCircuit
  }
];

const departments = stages.map((item) => item.department);

export function BusinessLoopDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = stages[activeIndex];
  const progress = ((activeIndex + 1) / stages.length) * 100;
  const StageIcon = stage.icon;
  const completedActions = activeIndex * 4 + 3;
  const contextFacts = 12 + activeIndex * 9;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current === stages.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [playing]);

  function restart() {
    setActiveIndex(0);
    setPlaying(true);
  }

  function next() {
    setPlaying(false);
    setActiveIndex((current) => Math.min(current + 1, stages.length - 1));
  }

  return (
    <section className="business-loop-demo" aria-labelledby="business-loop-demo-title">
      <div className="business-loop-demo-heading">
        <div>
          <p className="eyebrow">One opportunity. The entire AI operations department.</p>
          <h2 id="business-loop-demo-title">Watch the business move forward as one connected system.</h2>
          <p>
            This guided example shows how a configured service business can move from demand to revenue and future growth while Ferocity preserves context, follows authority, and interrupts a person only for a real decision.
          </p>
        </div>
        <div className="business-loop-demo-controls">
          <span className="illustrative-pill"><Sparkles size={14} /> Guided product walkthrough</span>
          <button
            className="mini-button"
            type="button"
            onClick={() => {
              if (!playing && activeIndex === stages.length - 1) {
                restart();
                return;
              }
              setPlaying((value) => !value);
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? "Pause" : activeIndex === stages.length - 1 ? "Replay" : "Play the full loop"}
          </button>
        </div>
      </div>

      <div className="business-loop-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="business-loop-layout">
        <nav className="business-loop-stages" aria-label="Business loop stages">
          {stages.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === activeIndex;
            return (
              <button
                className={isActive ? "active" : index < activeIndex ? "complete" : ""}
                type="button"
                onClick={() => { setPlaying(false); setActiveIndex(index); }}
                aria-current={isActive ? "step" : undefined}
                key={`${item.department}-${item.title}`}
              >
                <span><Icon size={16} /></span>
                <span><small>{item.time}</small><strong>{item.department}</strong></span>
                {index < activeIndex ? <CheckCircle2 size={15} /> : <ChevronRight size={15} />}
              </button>
            );
          })}
        </nav>

        <div className="business-loop-command" aria-live="polite">
          <div className="business-loop-command-topline">
            <div className="business-loop-stage-title">
              <span><StageIcon size={19} /></span>
              <div><small>Step {activeIndex + 1} of {stages.length} · {stage.time}</small><h3>{stage.title}</h3></div>
            </div>
            <span className={stage.humanNeeded ? "decision-pill attention" : "decision-pill"}>
              {stage.humanNeeded ? "Human decision" : "Handled within authority"}
            </span>
          </div>

          <div className="business-loop-thinking">
            <article><small>Ferocity noticed</small><p>{stage.signal}</p></article>
            <article><small>Ferocity coordinated</small><p>{stage.action}</p></article>
            <article><small>Verified result</small><p>{stage.result}</p></article>
          </div>

          <div className={stage.humanNeeded ? "business-loop-human attention" : "business-loop-human"}>
            {stage.humanNeeded ? <UsersRound size={18} /> : <ShieldCheck size={18} />}
            <div><small>Owner involvement</small><strong>{stage.human}</strong></div>
          </div>

          <div className="business-loop-evidence">
            {stage.evidence.map((item) => <span key={item}><CheckCircle2 size={14} /> {item}</span>)}
          </div>

          <div className="business-loop-live-state">
            <div><small>Shared context</small><strong>{contextFacts} facts</strong></div>
            <div><small>Authorized actions</small><strong>{completedActions} completed</strong></div>
            <div><small>Active department</small><strong>{stage.department}</strong></div>
            <div><small>Context at handoffs</small><strong>Preserved</strong></div>
          </div>

          <div className="business-loop-command-footer">
            <div className="business-loop-departments" aria-label="Connected departments">
              {departments.map((department, index) => (
                <span className={index <= activeIndex ? "active" : ""} key={department}>{department}</span>
              ))}
            </div>
            {activeIndex === stages.length - 1 ? (
              <button className="mini-button" type="button" onClick={restart}><RotateCcw size={15} /> Run it again</button>
            ) : (
              <button className="mini-button" type="button" onClick={next}>Next handoff <ChevronRight size={15} /></button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
