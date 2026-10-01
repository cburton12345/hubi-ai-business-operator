"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Volume2,
  X,
} from "lucide-react";
import { decideApproval } from "@/app/app/approvals/actions";
import {
  createFerocityThreadAction,
  executeFerocityChatAction,
} from "@/app/app/ferocity/actions";
import {
  ferocityGoals,
  ferocityOnboardingGoals,
  hasUsefulIndustry,
  moneyCommand,
  moneyOutcomes,
  type FerocityGoal,
} from "@/lib/ai-workforce/guided-conversation";
import type { CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";

type ChatTurn = {
  id: string;
  command: string;
  message: string;
  prepared: string[];
  blocked: string[];
  href?: string;
  runId?: string;
  needsInput?: boolean;
  uploaded?: { name: string; status: string }[];
  recommended?: CapabilityRecommendation[];
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

type OpportunityBrief = {
  headline: string;
  summary: string;
  discoveredCount: number;
  mattersNowCount: number;
  ferocityCanPrepareCount: number;
  ownerDecisionCount: number;
  connectionRequiredCount: number;
  focusNow: Array<
    AttentionItem & {
      evidence: string;
      confidence: number;
      handling:
        | "ferocity_can_prepare"
        | "owner_decision"
        | "connection_required"
        | "monitor";
    }
  >;
};

type GuideStep =
  "idle" | "industry" | "onboarding_goal" | "money_outcome" | "ready";

type ChatThread = { id: string; title: string; updated_at: string };
type ApprovalItem = {
  id: string;
  targetType: string;
  riskLevel: string;
  notes: string;
  createdAt: string;
};
type ActivityItem = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  occurredAt: string;
};
type SetupItem = { label: string; complete: boolean; href: string };
type LeaderRecommendation = { title: string; detail: string; href: string; command: string };

type VoiceMode = "off" | "dictation" | "conversation";
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return (
    voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null
  );
}

export function FerocityOwnerChat({
  initialCommand,
  sourceEvent,
  industry,
  attentionItems,
  opportunityBrief,
  onboardingMode = false,
  ownerName,
  threads,
  activeThreadId,
  initialTurns,
  approvals,
  activity,
  setupProgress,
  workspaceRole,
  leaderRecommendation,
}: {
  initialCommand: string;
  sourceEvent: SourceEvent | null;
  industry: string | null;
  attentionItems: AttentionItem[];
  opportunityBrief: OpportunityBrief;
  onboardingMode?: boolean;
  ownerName: string | null;
  threads: ChatThread[];
  activeThreadId: string | null;
  initialTurns: ChatTurn[];
  approvals: ApprovalItem[];
  activity: ActivityItem[];
  setupProgress: SetupItem[];
  workspaceRole: string;
  leaderRecommendation: LeaderRecommendation;
}) {
  const [command, setCommand] = useState(initialCommand);
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [guideStep, setGuideStep] = useState<GuideStep>(
    onboardingMode
      ? hasUsefulIndustry(industry)
        ? "onboarding_goal"
        : "industry"
      : "idle",
  );
  const [guideIndustry, setGuideIndustry] = useState(
    hasUsefulIndustry(industry) ? industry!.trim() : "",
  );
  const [guideOwnerMessage, setGuideOwnerMessage] = useState("");
  const [guideMessage, setGuideMessage] = useState(
    onboardingMode
      ? hasUsefulIndustry(industry)
        ? `Welcome to Ferocity. I know this is a ${industry!.trim()} business. Do you already know what you'd like to improve, or should I help find the best place to start?`
        : "Welcome to Ferocity. I’ll keep setup simple. First, what kind of business do you run?"
      : "",
  );
  const [showAttention, setShowAttention] = useState(false);
  const [submittedCommand, setSubmittedCommand] = useState("");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const [voiceStatus, setVoiceStatus] = useState("");
  const voiceModeRef = useRef<VoiceMode>("off");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const autoSubmitVoiceRef = useRef(false);
  const recordedResponse = useRef<string | null>(null);
  const [state, action, pending] = useActionState(executeFerocityChatAction, {
    ok: false,
  });

  const startListening = useCallback((mode: Exclude<VoiceMode, "off">) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus(
        "Voice input is not supported by this browser. Chrome or Edge works best.",
      );
      voiceModeRef.current = "off";
      setVoiceMode("off");
      return;
    }
    recognitionRef.current?.abort();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      let final = false;
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
        final ||= Boolean(event.results[index]?.isFinal);
      }
      if (transcript.trim()) setCommand(transcript.trim());
      if (final) {
        setVoiceStatus(
          mode === "conversation" ? "Thinking…" : "Ready to review and send",
        );
        if (mode === "conversation") autoSubmitVoiceRef.current = true;
        recognition.stop();
      }
    };
    recognition.onerror = (event) => {
      setVoiceStatus(
        event.error === "not-allowed"
          ? "Microphone permission was denied."
          : `Voice input stopped: ${event.error.replaceAll("-", " ")}.`,
      );
      if (event.error === "not-allowed") {
        voiceModeRef.current = "off";
        setVoiceMode("off");
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    voiceModeRef.current = mode;
    setVoiceMode(mode);
    setVoiceStatus(
      mode === "conversation"
        ? "Listening—speak naturally"
        : "Listening for one message…",
    );
    recognition.start();
  }, []);

  useEffect(() => {
    if (!submittedCommand || !state.message) return;
    const responseKey = `${submittedCommand}:${state.runId ?? state.href ?? state.message}`;
    if (recordedResponse.current === responseKey) return;
    recordedResponse.current = responseKey;
    if (state.threadId) {
      window.history.replaceState(
        null,
        "",
        `/app/ferocity?thread=${state.threadId}`,
      );
    }
    setTurns((current) => [
      ...current,
      {
        id: responseKey,
        command: submittedCommand,
        message: state.message ?? "Ferocity finished reviewing the request.",
        prepared: state.prepared ?? [],
        blocked: state.blocked ?? [],
        href: state.href,
        runId: state.runId,
        needsInput: state.needsInput,
        uploaded: state.uploaded,
        recommended: state.recommended,
      },
    ]);
    setCommand("");
    setGuideStep("idle");
    setGuideMessage("");
    setGuideOwnerMessage("");
    setAttachmentNames([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => {
      composerRef.current?.querySelector("textarea")?.focus();
    });
    if (voiceMode === "conversation" && "speechSynthesis" in window) {
      const spoken = new SpeechSynthesisUtterance(state.message);
      spoken.rate = 1;
      spoken.onstart = () => setVoiceStatus("Ferocity is speaking…");
      spoken.onend = () => {
        if (voiceModeRef.current !== "conversation") return;
        setVoiceStatus("Listening…");
        startListening("conversation");
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(spoken);
    }
  }, [startListening, state, submittedCommand, voiceMode]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [guideStep, pending, showAttention, turns]);

  useEffect(() => {
    if (!autoSubmitVoiceRef.current || pending || command.trim().length < 2)
      return;
    autoSubmitVoiceRef.current = false;
    composerRef.current?.requestSubmit();
  }, [command, pending]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window)
        window.speechSynthesis.cancel();
    },
    [],
  );

  function stopVoice() {
    autoSubmitVoiceRef.current = false;
    voiceModeRef.current = "off";
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoiceMode("off");
    setVoiceStatus("");
  }

  function chooseGoal(goal: FerocityGoal) {
    setGuideOwnerMessage(goal.label);
    if (goal.key === "money") {
      if (hasUsefulIndustry(guideIndustry)) {
        setGuideStep("money_outcome");
        setGuideMessage(
          `I know this is a ${guideIndustry} business. Where should I focus first?`,
        );
      } else {
        setGuideStep("industry");
        setGuideMessage(
          "First, what kind of business is this—or are you still deciding which industry to enter?",
        );
        setCommand("");
      }
      return;
    }

    setGuideStep("ready");
    setGuideMessage(
      "I can start there. Review the request below, add any detail you want, then send it. I’ll use what the Business Brain already knows instead of making you repeat yourself.",
    );
    setCommand(goal.command);
  }

  function chooseMoneyOutcome(outcome: string) {
    setGuideStep("ready");
    setGuideMessage(
      "Good. I’ll check what is already working, find the strongest opportunities, and prepare the next moves. Review or add detail, then send it.",
    );
    setCommand(moneyCommand(guideIndustry, outcome));
  }

  function startFreeformGoal() {
    setGuideOwnerMessage("I know what I want to improve");
    setGuideStep("ready");
    setGuideMessage(
      "Tell me in your own words. I’ll use what Ferocity already knows, ask only for missing information, and turn it into practical next steps.",
    );
    setCommand("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (guideStep === "industry") {
      event.preventDefault();
      const nextIndustry = command.trim();
      if (nextIndustry.length < 2) return;
      setGuideIndustry(nextIndustry);
      if (onboardingMode) {
        setGuideOwnerMessage(`My business is ${nextIndustry}`);
        setGuideStep("onboarding_goal");
        setGuideMessage(
          `Got it—${nextIndustry}. Do you already know what you'd like to improve, or should I help find the best place to start?`,
        );
      } else {
        setGuideOwnerMessage(`Make more money — ${nextIndustry}`);
        setGuideStep("money_outcome");
        setGuideMessage(
          `Got it—${nextIndustry}. Which result matters most right now?`,
        );
      }
      setCommand("");
      return;
    }
    setSubmittedCommand(command.trim());
  }

  const conversationContext = turns
    .slice(-6)
    .map((turn) => `Owner: ${turn.command}\nFerocity: ${turn.message}`)
    .join("\n\n")
    .slice(-6000);
  const awaitingClarification = turns.at(-1)?.needsInput === true;
  const currentThreadId = state.threadId ?? activeThreadId;
  const visibleSetupProgress = onboardingMode
    ? setupProgress
    : setupProgress.filter((item) => !item.complete);

  return (
    <main className="ferocity-chat-shell">
      <header className="ferocity-chat-header">
        <div className="ferocity-chat-identity">
          <span className="ferocity-chat-avatar">
            <Sparkles size={20} />
          </span>
          <div>
            <p className="eyebrow">Your business, coordinated</p>
            <h1>Ferocity</h1>
          </div>
        </div>
        <div className="ferocity-chat-header-actions">
          {attentionItems.length ? (
            <button
              className="ferocity-attention-badge"
              type="button"
              aria-controls="ferocity-priority-list"
              aria-expanded={showAttention}
              onClick={() => setShowAttention((current) => !current)}
            >
              <BellRing size={14} /> {attentionItems.length} need attention
            </button>
          ) : null}
          <span className="pill">
            <ShieldCheck size={14} /> Authority rules active
          </span>
          <details className="ferocity-chat-history">
            <summary>
              <History size={14} /> Conversations <ChevronDown size={13} />
            </summary>
            <div>
              <form action={createFerocityThreadAction}>
                <button type="submit">
                  <Plus size={13} /> New conversation
                </button>
              </form>
              {threads.map((thread) => (
                <Link
                  aria-current={
                    thread.id === currentThreadId ? "page" : undefined
                  }
                  href={`/app/ferocity?thread=${thread.id}`}
                  key={thread.id}
                >
                  <span>{thread.title}</span>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(thread.updated_at))}
                  </small>
                </Link>
              ))}
              {!threads.length ? <p>No saved conversations yet.</p> : null}
            </div>
          </details>
        </div>
      </header>

      <section className="ferocity-chat-thread" aria-live="polite">
        <article className="ferocity-chat-message ferocity-chat-message-ai">
          <span className="ferocity-chat-avatar">
            <Sparkles size={18} />
          </span>
          <div className="ferocity-chat-bubble">
            <strong>{onboardingMode ? `Hi${ownerName ? ` ${ownerName.split(/\s+/)[0]}` : ""}—welcome to Ferocity.` : leaderRecommendation.title}</strong>
            <p>
              {onboardingMode
                ? "I’ll guide this one step at a time. Tell me what is slowing the business down or what result you want—there is no setup manual to learn."
                : leaderRecommendation.detail}
            </p>
            {!onboardingMode ? <div className="button-row"><button className="mini-button" type="button" onClick={() => setCommand(leaderRecommendation.command)}>Lead this now</button><Link className="mini-button secondary-button" href={leaderRecommendation.href}>See why</Link></div> : null}
          </div>
        </article>

        {(onboardingMode || visibleSetupProgress.length > 0) &&
        turns.length === 0 ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <CheckCircle2 size={18} />
            </span>
            <div className="ferocity-chat-bubble ferocity-setup-card">
              <strong>Your simple setup path</strong>
              <p>
                You do not have to hunt through settings. Tell me what you want,
                or open only the step that needs you.
              </p>
              <div className="ferocity-setup-progress">
                {visibleSetupProgress.map((item) => (
                  <Link
                    href={item.href}
                    key={item.label}
                    className={item.complete ? "complete" : ""}
                  >
                    {item.complete ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <span className="setup-step-dot" />
                    )}
                    <span>{item.label}</span>
                    <small>{item.complete ? "Ready" : "Finish"}</small>
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ) : null}

        {opportunityBrief.discoveredCount ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar ferocity-chat-avatar-attention">
              <BellRing size={18} />
            </span>
            <div className="ferocity-chat-bubble">
              <strong>{opportunityBrief.headline}</strong>
              <p>{opportunityBrief.summary}</p>
              <div className="button-row">
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => setShowAttention((current) => !current)}
                >
                  {showAttention
                    ? "Hide priorities"
                    : "Show what matters first"}
                </button>
                <button
                  className="mini-button secondary-button"
                  type="button"
                  onClick={() =>
                    setCommand(
                      "Run the safe business scans across every connected area. Prepare or perform every safe authorized fix, then bring me only the three highest-value items and decisions that still need me.",
                    )
                  }
                >
                  Handle what you can
                </button>
                <Link
                  className="mini-button secondary-button"
                  href="/app/attention-command"
                >
                  Review all evidence
                </Link>
              </div>
              {showAttention ? (
                <ul className="ferocity-attention-list" id="ferocity-priority-list">
                  {opportunityBrief.focusNow.slice(0, 4).map((item) => (
                    <li key={`${item.href}-${item.title}`}>
                      <span className={`status-dot ${item.urgency}`} />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <small>
                          {item.confidence}% confidence ·{" "}
                          {item.handling === "ferocity_can_prepare"
                            ? "Ferocity can prepare this"
                            : item.handling === "owner_decision"
                              ? "Your decision is needed"
                              : "Connection needed"}
                        </small>
                      </div>
                      <Link href={item.href}>
                        Open <ArrowRight size={12} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        ) : null}

        {sourceEvent ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <TriangleAlert size={18} />
            </span>
            <div className="ferocity-chat-bubble">
              <p className="eyebrow">
                {sourceEvent.platformName} · {sourceEvent.severity}
              </p>
              <strong>{sourceEvent.title}</strong>
              <p>{sourceEvent.summary}</p>
              {sourceEvent.recommendedAction ? (
                <p>
                  <strong>Suggested next step:</strong>{" "}
                  {sourceEvent.recommendedAction}
                </p>
              ) : null}
            </div>
          </article>
        ) : null}

        {approvals.length ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar ferocity-chat-avatar-attention">
              <ShieldCheck size={18} />
            </span>
            <div className="ferocity-chat-bubble">
              <strong>
                {approvals.length} approval{approvals.length === 1 ? "" : "s"}{" "}
                ready for your decision
              </strong>
              <p>
                Review and decide here. You do not need to leave the
                conversation.
              </p>
              <div className="ferocity-inline-approvals">
                {approvals.map((approval) => (
                  <form action={decideApproval} key={approval.id}>
                    <input
                      type="hidden"
                      name="approvalId"
                      value={approval.id}
                    />
                    <div>
                      <span className={`pill ${approval.riskLevel}`}>
                        {approval.riskLevel} risk
                      </span>
                      <strong>
                        {approval.targetType.replaceAll("_", " ")}
                      </strong>
                    </div>
                    <p>
                      {approval.notes ||
                        "Ferocity prepared this action and needs your decision before it continues."}
                    </p>
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Optional note or requested change"
                    />
                    <div className="button-row">
                      <button
                        className="mini-button"
                        name="decision"
                        value="approved"
                      >
                        Approve
                      </button>
                      <button
                        className="mini-button secondary-button"
                        name="decision"
                        value="changes_requested"
                      >
                        Request changes
                      </button>
                      <button
                        className="mini-button danger-button"
                        name="decision"
                        value="rejected"
                      >
                        Reject
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </div>
          </article>
        ) : null}

        {guideStep !== "idle" ? (
          <div className="ferocity-chat-exchange">
            {guideOwnerMessage ? (
              <article className="ferocity-chat-message ferocity-chat-message-owner">
                <div className="ferocity-chat-bubble">
                  <p>{guideOwnerMessage}</p>
                </div>
              </article>
            ) : null}
            <article className="ferocity-chat-message ferocity-chat-message-ai">
              <span className="ferocity-chat-avatar">
                <Sparkles size={18} />
              </span>
              <div className="ferocity-chat-bubble">
                <strong>{guideMessage}</strong>
                {guideStep === "money_outcome" ? (
                  <div
                    className="ferocity-chat-next-choices"
                    aria-label="Choose a growth outcome"
                  >
                    {moneyOutcomes.map((outcome) => (
                      <button
                        type="button"
                        key={outcome}
                        onClick={() => chooseMoneyOutcome(outcome)}
                      >
                        {outcome}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                ) : null}
                {guideStep === "onboarding_goal" ? (
                  <div
                    className="ferocity-chat-next-choices"
                    aria-label="Choose the first business outcome"
                  >
                    <button type="button" onClick={startFreeformGoal}>
                      I know what I want to improve
                      <ArrowRight size={14} />
                    </button>
                    {ferocityOnboardingGoals.map((goal) => (
                      <button
                        type="button"
                        key={goal.key}
                        onClick={() => chooseGoal(goal)}
                      >
                        {goal.label}
                        <ArrowRight size={14} />
                      </button>
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
              <div className="ferocity-chat-bubble">
                <p>{turn.command}</p>
              </div>
            </article>
            <article className="ferocity-chat-message ferocity-chat-message-ai">
              <span className="ferocity-chat-avatar">
                <Sparkles size={18} />
              </span>
              <div className="ferocity-chat-bubble">
                <div className="ferocity-result-heading">
                  <span
                    className={`pill ${turn.blocked.length ? "high" : turn.needsInput ? "medium" : "ready"}`}
                  >
                    {turn.needsInput
                      ? "Needs your answer"
                      : turn.blocked.length
                        ? "Needs attention"
                        : "Completed"}
                  </span>
                  <strong>{turn.message}</strong>
                </div>
                {turn.uploaded?.length ? (
                  <div className="ferocity-upload-results">
                    <p className="eyebrow">Files received</p>
                    {turn.uploaded.map((file) => (
                      <span key={`${file.name}-${file.status}`}>
                        <FileText size={14} /> {file.name} ·{" "}
                        {file.status.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}
                {turn.prepared.length ? (
                  <div className="ferocity-result-section">
                    <p className="eyebrow">What I handled</p>
                    <ul className="ferocity-chat-result-list">
                      {turn.prepared.map((item) => (
                        <li key={item}>
                          <CheckCircle2 size={15} /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {turn.blocked.length ? (
                  <div className="ferocity-result-section">
                    <p className="eyebrow">What needs you</p>
                    <ul className="ferocity-chat-result-list ferocity-chat-result-blocked">
                      {turn.blocked.map((item) => (
                        <li key={item}>
                          <TriangleAlert size={15} /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {turn.recommended?.length ? (
                  <div className="ferocity-result-section">
                    <p className="eyebrow">Worth using next</p>
                    <p>
                      I found these because they match what you asked for—not
                      because you need to learn every Ferocity feature.
                    </p>
                    <div className="ferocity-chat-next-choices">
                      {turn.recommended.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          onClick={() => setCommand(item.command)}
                        >
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.why}</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="button-row">
                  {turn.href ? (
                    <Link className="mini-button" href={turn.href}>
                      Continue where needed <ArrowRight size={13} />
                    </Link>
                  ) : null}
                  {turn.runId ? (
                    <Link
                      className="mini-button secondary-button"
                      href={`/app/ai-workforce/results/${turn.runId}`}
                    >
                      Review details
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          </div>
        ))}

        {pending ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <Sparkles size={18} />
            </span>
            <div className="ferocity-chat-bubble ferocity-chat-thinking">
              Ferocity is checking the business and preparing the next action…
            </div>
          </article>
        ) : null}

        {activity.length ? (
          <details className="ferocity-activity-card">
            <summary>
              <Sparkles size={15} /> What Ferocity has been doing{" "}
              <span>{activity.length} recent updates</span>
            </summary>
            <div>
              {activity.map((item) => (
                <article key={item.id}>
                  <span
                    className={`status-dot ${["blocked", "failed", "needs_attention"].includes(item.status) ? "high" : "low"}`}
                  />
                  <div>
                    <strong>{item.title}</strong>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(item.occurredAt))}
                  </small>
                </article>
              ))}
              <Link href="/app/automation-timeline">
                View complete activity history <ArrowRight size={12} />
              </Link>
            </div>
          </details>
        ) : null}
        <div ref={conversationEndRef} aria-hidden="true" />
      </section>

      {turns.length === 0 && guideStep === "idle" && !command.trim() ? (
        <>
          {onboardingMode ? <div
            className="ferocity-goal-grid"
            aria-label="Choose what you want to accomplish"
          >
            {ferocityGoals.map((goal) => (
              <button
                type="button"
                key={goal.key}
                onClick={() => chooseGoal(goal)}
              >
                <strong>{goal.label}</strong>
                <span>{goal.description}</span>
              </button>
            ))}
          </div> : null}
          <div className="ferocity-chat-suggestions" aria-label="Quick actions">
            {(onboardingMode ? [
              "Find my biggest bottleneck", "Add a customer", "Create a job", "Schedule work", "Log an expense"
            ] : [
              "Lead the business and handle the top priority",
              "Handle every safe action and show me decisions only",
              "Find the next three revenue or cash opportunities"
            ]).map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() =>
                  setCommand(
                    `${suggestion}. Ask me only for the details Ferocity does not already know.`,
                  )
                }
              >
                {suggestion}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <form
        ref={composerRef}
        action={action}
        className="ferocity-chat-composer"
        onSubmit={handleSubmit}
        aria-busy={pending}
      >
        <input type="hidden" name="threadId" value={currentThreadId ?? ""} />
        <input
          type="hidden"
          name="conversationContext"
          value={conversationContext}
        />
        <input
          type="hidden"
          name="onboardingMode"
          value={onboardingMode ? "true" : "false"}
        />
        <input
          type="hidden"
          name="inputMode"
          value={
            voiceMode === "conversation"
              ? "voice_conversation"
              : voiceMode === "dictation"
                ? "voice_dictation"
                : "text"
          }
        />
        <label
          className="ferocity-attach-button"
          htmlFor="ferocity-documents"
          title="Add receipts, invoices, bills, warranties, photos, or PDFs"
        >
          <Paperclip size={18} />
          <span className="sr-only">Attach documents</span>
        </label>
        <button
          className="ferocity-attach-button"
          type="button"
          title="Dictate one message"
          aria-label="Dictate one message"
          onClick={() =>
            voiceMode === "dictation"
              ? stopVoice()
              : startListening("dictation")
          }
        >
          {voiceMode === "dictation" ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className={`ferocity-voice-button ${voiceMode === "conversation" ? "active" : ""}`}
          type="button"
          onClick={() =>
            voiceMode === "conversation"
              ? stopVoice()
              : startListening("conversation")
          }
        >
          {voiceMode === "conversation" ? (
            <MicOff size={17} />
          ) : (
            <Volume2 size={17} />
          )}
          {voiceMode === "conversation" ? "Stop voice" : "Voice chat"}
        </button>
        <input
          className="sr-only"
          id="ferocity-documents"
          name="documents"
          type="file"
          ref={fileInputRef}
          accept="image/*,application/pdf"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 25) {
              event.currentTarget.value = "";
              setAttachmentNames([]);
              setVoiceStatus("Choose up to 25 files in one batch.");
              return;
            }
            setAttachmentNames(files.map((file) => file.name));
            setVoiceStatus("");
          }}
        />
        <div className="ferocity-composer-body">
          {attachmentNames.length ? (
            <p className="ferocity-selected-files">
              <FileText size={13} /> {attachmentNames.length} file
              {attachmentNames.length === 1 ? "" : "s"} ready
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  setAttachmentNames([]);
                }}
              >
                <X size={12} /> Clear
              </button>
            </p>
          ) : null}
          <label className="sr-only" htmlFor="ferocity-owner-command">
            Ask Ferocity or tell it what to do
          </label>
          <textarea
            id="ferocity-owner-command"
            name="command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !pending &&
                command.trim().length >= 2
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              guideStep === "industry"
                ? "Example: Roofing, a dental office, or I'm looking for an industry…"
                : awaitingClarification
                  ? "Answer in your own words…"
                  : "What's slowing the business down—or what should Ferocity accomplish?"
            }
            minLength={2}
            maxLength={2000}
            rows={3}
            required
            autoFocus
            aria-describedby="ferocity-composer-hint"
          />
          <small className="ferocity-composer-hint" id="ferocity-composer-hint">
            Enter sends · Shift+Enter adds a line · up to 25 files
          </small>
        </div>
        <button
          className="button"
          type="submit"
          disabled={pending || command.trim().length < 2}
          aria-label="Send to Ferocity"
        >
          <Send size={17} />
        </button>
      </form>
      {voiceStatus ? (
        <p className="ferocity-voice-status" role="status">
          {voiceStatus}
        </p>
      ) : null}
      <div className="ferocity-chat-footer">
        <p className="ferocity-chat-footnote">
          Ferocity follows your authority settings.{" "}
          {workspaceRole === "owner"
            ? "You control spending, publishing, payments, customer-facing messages, and other consequential actions. Voice can prepare them, but a visible click is still required to approve them."
            : "Your workspace role controls which actions you can approve."}
        </p>
        <Link href="/app/full">
          <LayoutDashboard size={13} /> Prefer dashboards? Open the full Command
          Center.
        </Link>
      </div>
    </main>
  );
}
