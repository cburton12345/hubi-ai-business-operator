"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
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
  completeH4rOwnerPaymentAuthorizationAction,
  controlOperatingGoalAction,
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
import { validateExpenseDocumentSelection } from "@/lib/document-intelligence/upload-policy";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { uploadAndProcessExpenseDocuments } from "@/lib/document-intelligence/direct-upload-client";
import type { StatementYearCoverage } from "@/lib/document-intelligence/statement-year-coverage";
import type { FerocityArtifactLink, FerocityCustomerMode } from "@/lib/ferocity/conversation-runtime";
import { presentFerocityMessage } from "@/lib/ui/ferocity-message";
import type { OwnerTwinSuggestion } from "@/lib/ferocity/owner-operating-twin";

type ChatTurn = {
  id: string;
  command: string;
  message: string;
  prepared: string[];
  blocked: string[];
  href?: string;
  actionLabel?: string;
  runId?: string;
  intent?: string;
  needsInput?: boolean;
  uploaded?: { name: string; status: string }[];
  recommended?: CapabilityRecommendation[];
  statementCoverage?: StatementYearCoverage;
  artifacts?: FerocityArtifactLink[];
};

function documentStatusLabel(status: string) {
  switch (status) {
    case "already imported":
      return "already here";
    case "needs_review":
      return "quick check needed";
    case "duplicate":
      return "possible duplicate";
    case "auto_approved":
    case "approved":
      return "ready";
    case "failed":
      return "could not read";
    default:
      return status.replaceAll("_", " ");
  }
}

function FerocityAnswer({ message }: { message: string }) {
  const presentation = presentFerocityMessage(message);
  return (
    <>
      <strong>{presentation.message}</strong>
      {presentation.technicalNotices.length ? (
        <details className="ferocity-response-diagnostics">
          <summary>How Ferocity handled this</summary>
          {presentation.technicalNotices.map((notice) => <p key={notice}>{notice}</p>)}
        </details>
      ) : null}
    </>
  );
}

function formatWorkspaceTime(
  value: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(date);
  }
}

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
type OperatingGoalItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  authorityMode: string;
  summary: string | null;
  nextEvaluationAt: string;
  outcomeVerified: boolean;
  stepsTotal: number;
  stepsCompleted: number;
  stepsActive: number;
  stepsNeedOwner: number;
  currentStepTitle: string | null;
  currentStepHref: string | null;
};

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
  canControlGoals,
  customerMode,
  workspaceTimeZone,
  leaderRecommendation,
  ownerTwinSuggestions,
  operatingGoalTotal,
  operatingGoals,
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
  canControlGoals: boolean;
  customerMode: FerocityCustomerMode;
  workspaceTimeZone: string;
  leaderRecommendation: LeaderRecommendation;
  ownerTwinSuggestions: OwnerTwinSuggestion[];
  operatingGoalTotal: number;
  operatingGoals: OperatingGoalItem[];
}) {
  const router = useRouter();
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
  const queuedCommandRef = useRef<string | null>(null);
  const recordedResponse = useRef<string | null>(null);
  const h4rAuthorizationHandledRef = useRef(false);
  const [state, action, actionPending] = useActionState(executeFerocityChatAction, {
    ok: false,
  });
  const [uploading, setUploading] = useState(false);
  const [dispatchPending, startDispatch] = useTransition();
  const [requestDelayed, setRequestDelayed] = useState(false);
  const pending = actionPending || uploading || dispatchPending;
  const latestRecommendations = command.trim() || pending
    ? []
    : turns.at(-1)?.recommended ?? [];
  const showSuggestions = latestRecommendations.length > 0
    || (turns.length === 0 && guideStep === "idle");

  useEffect(() => {
    if (h4rAuthorizationHandledRef.current || typeof window === "undefined") return;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const proofToken = fragment.get("h4r_authorization");
    if (!proofToken) return;
    h4rAuthorizationHandledRef.current = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    startDispatch(async () => {
      setVoiceStatus("Verifying the signed-in H4R workspace connection…");
      try {
        const result = await completeH4rOwnerPaymentAuthorizationAction(proofToken);
        setVoiceStatus(result.message);
        if (result.ok) router.refresh();
      } catch {
        setVoiceStatus("Ferocity could not verify the H4R connection. Reconnect while signed into the intended H4R workspace.");
      }
    });
  }, [router]);

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
    setRequestDelayed(false);
    if (state.threadId) {
      window.history.replaceState(
        null,
        "",
        `/app/ferocity?thread=${state.threadId}${onboardingMode ? "&onboarding=1" : ""}`,
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
        actionLabel: state.actionLabel,
        runId: state.runId,
        intent: state.intent,
        needsInput: state.needsInput,
        uploaded: state.uploaded,
        recommended: state.recommended,
        artifacts: state.artifacts,
      },
    ]);
    const failedNames = new Set(
      (state.uploaded ?? [])
        .filter((file) => file.status === "failed")
        .map((file) => file.name),
    );
    const selectedFiles = Array.from(fileInputRef.current?.files ?? []);
    const failedFiles = selectedFiles.filter((file) => failedNames.has(file.name));
    setCommand(failedFiles.length ? submittedCommand : "");
    if (!failedFiles.length && voiceMode !== "conversation") {
      setVoiceStatus("");
    }
    setGuideStep("idle");
    setGuideMessage("");
    setGuideOwnerMessage("");
    if (fileInputRef.current) {
      const transfer = new DataTransfer();
      failedFiles.forEach((file) => transfer.items.add(file));
      fileInputRef.current.files = transfer.files;
    }
    setAttachmentNames(failedFiles.map((file) => file.name));
    router.refresh();
    if (failedFiles.length) {
      setVoiceStatus(`${failedFiles.length} failed file${failedFiles.length === 1 ? " is" : "s are"} still selected. Fix the issue and send again; successful files will not be reprocessed.`);
    }
    requestAnimationFrame(() => {
      composerRef.current?.querySelector("textarea")?.focus();
    });
    if (voiceMode === "conversation" && "speechSynthesis" in window) {
      const spoken = new SpeechSynthesisUtterance(presentFerocityMessage(state.message).message);
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
  }, [onboardingMode, router, startListening, state, submittedCommand, voiceMode]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [guideStep, pending, showAttention, turns]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setRequestDelayed(true), 45_000);
    return () => window.clearTimeout(timer);
  }, [pending, submittedCommand]);

  useEffect(() => {
    if (!autoSubmitVoiceRef.current || pending || command.trim().length < 2)
      return;
    autoSubmitVoiceRef.current = false;
    composerRef.current?.requestSubmit();
  }, [command, pending]);

  useEffect(() => {
    if (!queuedCommandRef.current || pending || command !== queuedCommandRef.current) return;
    queuedCommandRef.current = null;
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

  function submitSuggestedCommand(value: string) {
    if (pending) return;
    if (command === value) {
      queuedCommandRef.current = null;
      composerRef.current?.requestSubmit();
      return;
    }
    queuedCommandRef.current = value;
    setCommand(value);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
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
    const trimmedCommand = command.trim();
    if (trimmedCommand.length < 2 && attachmentNames.length === 0) {
      event.preventDefault();
      setVoiceStatus("Enter a request or attach at least one document.");
      return;
    }
    event.preventDefault();
    setRequestDelayed(false);
    const outgoingCommand = trimmedCommand || `Attached ${attachmentNames.length} document${attachmentNames.length === 1 ? "" : "s"} for review`;
    const payload = new FormData(event.currentTarget);
    payload.set("clientRequestId", crypto.randomUUID());
    setVoiceStatus("Ferocity is reviewing the request…");
    setSubmittedCommand(outgoingCommand);
    setCommand("");
    const files = Array.from(fileInputRef.current?.files ?? []);
    if (files.length) {
      setUploading(true);
      try {
        const processed = await uploadAndProcessExpenseDocuments({
          files,
          sourceProduct: "ferocity",
          sourceMessageRef: currentThreadId,
          suppliedText: trimmedCommand || null,
          onProgress: setVoiceStatus
        });
        payload.delete("documents");
        payload.set("processedDocuments", JSON.stringify(processed.results));
        startDispatch(() => action(payload));
      } catch (uploadError) {
        setRequestDelayed(false);
        setCommand(trimmedCommand);
        setSubmittedCommand("");
        setVoiceStatus(uploadError instanceof Error ? uploadError.message : "The document upload failed. Your files remain selected.");
      } finally {
        setUploading(false);
      }
      return;
    }
    startDispatch(() => action(payload));
  }

  const conversationContext = turns
    .slice(-6)
    .map((turn) => `Owner: ${turn.command}\nFerocity: ${turn.message}`)
    .join("\n\n")
    .slice(-6000);
  const awaitingClarification = turns.at(-1)?.needsInput === true;
  const currentThreadId = state.threadId ?? activeThreadId;
  const visibleSetupProgress = onboardingMode
    ? setupProgress.filter((item) => !item.complete).slice(0, 1)
    : setupProgress.filter((item) => !item.complete);
  const remainingSetupSteps = setupProgress.filter((item) => !item.complete).length;

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
                    {formatWorkspaceTime(thread.updated_at, workspaceTimeZone, {
                      month: "short",
                      day: "numeric",
                    })}
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
            {!onboardingMode ? <div className="button-row"><button className="mini-button" type="button" onClick={() => submitSuggestedCommand(leaderRecommendation.command)}>Lead this now</button><Link className="mini-button secondary-button" href={leaderRecommendation.href}>See why</Link></div> : null}
            {!onboardingMode && ownerTwinSuggestions.length ? (
              <details className="ferocity-context-disclosure">
                <summary>
                  <span>
                    <strong>Likely next — in your operating style</strong>
                    <small>Adaptive suggestions; authority rules still apply</small>
                  </span>
                </summary>
                <div className="form-stack">
                  {ownerTwinSuggestions.map((suggestion) => (
                    <button
                      className="mini-button secondary-button"
                      key={suggestion.command}
                      onClick={() => submitSuggestedCommand(suggestion.command)}
                      title={`${Math.round(suggestion.confidence * 100)}% confidence · ${suggestion.reason}`}
                      type="button"
                    >
                      {suggestion.label}
                      {suggestion.executionMode === "draft_only" ? " · review first" : ""}
                    </button>
                  ))}
                  <p className="muted">One tap submits the command in your wording. Ferocity can prepare or carry out only what your existing authority rules allow.</p>
                </div>
              </details>
            ) : null}
          </div>
        </article>

        {(onboardingMode || (visibleSetupProgress.length > 0 && turns.length === 0)) ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <CheckCircle2 size={18} />
            </span>
            <div className="ferocity-chat-bubble ferocity-setup-card">
              <details className="ferocity-context-disclosure" open={onboardingMode}>
                <summary>
                  <span>
                    <strong>Setup</strong>
                    <small>{remainingSetupSteps} step{remainingSetupSteps === 1 ? "" : "s"} remaining</small>
                  </span>
                </summary>
                <div>
                  <p>{onboardingMode ? "Continue from the exact unfinished step." : "Open only the setup step that needs you."}</p>
                  <div className="ferocity-setup-progress">
                    {visibleSetupProgress.map((item) => (
                      <Link href={item.href} key={item.label} className={item.complete ? "complete" : ""}>
                        {item.complete ? <CheckCircle2 size={15} /> : <span className="setup-step-dot" />}
                        <span>{item.label}</span>
                        <small>{item.complete ? "Ready" : "Finish"}</small>
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </article>
        ) : null}

        {opportunityBrief.discoveredCount ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar ferocity-chat-avatar-attention">
              <BellRing size={18} />
            </span>
            <div className="ferocity-chat-bubble">
              <details className="ferocity-context-disclosure">
                <summary>
                  <span>
                    <strong>{opportunityBrief.mattersNowCount} business priorit{opportunityBrief.mattersNowCount === 1 ? "y" : "ies"}</strong>
                    <small>{opportunityBrief.summary}</small>
                  </span>
                </summary>
                <div>
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
                    submitSuggestedCommand(
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
                      {item.handling === "ferocity_can_prepare" ? (
                        <button
                          className="mini-button"
                          type="button"
                          disabled={pending}
                          onClick={() => submitSuggestedCommand(
                            `Handle this business priority now: ${item.title}. ${item.detail} Use verified workspace evidence, complete every safe authorized internal step, and return the finished work or the exact decision still needed.`,
                          )}
                        >
                          Have Ferocity handle this <ArrowRight size={12} />
                        </button>
                      ) : (
                        <Link href={item.href}>
                          {item.handling === "owner_decision" ? "Review decision" : "Connect"} <ArrowRight size={12} />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
                </div>
              </details>
            </div>
          </article>
        ) : null}

        {operatingGoals.length ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <Sparkles size={18} />
            </span>
            <div className="ferocity-chat-bubble">
              <details className="ferocity-context-disclosure">
                <summary>
                  <span>
                    <strong>Ferocity is continuing {operatingGoalTotal} outcome{operatingGoalTotal === 1 ? "" : "s"}</strong>
                    <small>Background work stays tied to evidence, authority, and the next real dependency.</small>
                  </span>
                </summary>
                <div>
                  <ul className="ferocity-background-goals">
                    {operatingGoals.map((goal) => (
                      <li key={goal.id}>
                        <div>
                          <strong>{goal.title}</strong>
                          <small>{goal.summary ?? "Ferocity will evaluate this again when evidence or a dependency changes."}</small>
                          {goal.stepsTotal > 0 ? (
                            <small className="ferocity-goal-progress">
                              {goal.stepsCompleted}/{goal.stepsTotal} plan steps done
                              {goal.stepsActive ? ` · ${goal.stepsActive} active` : ""}
                              {goal.stepsNeedOwner ? ` · ${goal.stepsNeedOwner} needs review` : ""}
                              {goal.outcomeVerified ? " · outcome verified" : " · outcome evidence pending"}
                            </small>
                          ) : null}
                          {goal.currentStepTitle ? (
                            goal.currentStepHref ? (
                              <Link className="ferocity-goal-current-step" href={goal.currentStepHref}>
                                Next: {goal.currentStepTitle} <ArrowRight size={12} />
                              </Link>
                            ) : (
                              <small className="ferocity-goal-current-step">Next: {goal.currentStepTitle}</small>
                            )
                          ) : null}
                          {canControlGoals ? <form action={controlOperatingGoalAction} className="ferocity-goal-controls">
                            <input type="hidden" name="goalId" value={goal.id} />
                            {goal.status === "paused" ? (
                              <PendingSubmitButton className="mini-button" name="control" value="resume" pendingLabel="Resuming…">Resume</PendingSubmitButton>
                            ) : (
                              <PendingSubmitButton className="mini-button secondary-button" name="control" value="pause" pendingLabel="Pausing…">Pause</PendingSubmitButton>
                            )}
                            {["blocked", "needs_owner", "waiting"].includes(goal.status) ? (
                              <PendingSubmitButton className="mini-button secondary-button" name="control" value="retry" pendingLabel="Retrying…">Retry</PendingSubmitButton>
                            ) : null}
                            <PendingSubmitButton className="mini-button danger-button" name="control" value="cancel" pendingLabel="Canceling…">Cancel</PendingSubmitButton>
                          </form> : null}
                        </div>
                        <span className={`pill ${goal.status === "needs_owner" || goal.status === "blocked" ? "high" : goal.status === "paused" ? "medium" : "ready"}`}>
                          {goal.status === "needs_owner" ? "Needs you" : goal.status.replaceAll("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {operatingGoalTotal > operatingGoals.length ? (
                    <p className="muted">
                      {operatingGoalTotal - operatingGoals.length} more outcome{operatingGoalTotal - operatingGoals.length === 1 ? " is" : "s are"} continuing in the background.
                    </p>
                  ) : null}
                  <Link className="mini-button secondary-button" href="/app/automation-timeline">
                    See background progress <ArrowRight size={13} />
                  </Link>
                </div>
              </details>
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
              <details className="ferocity-context-disclosure">
                <summary>
                  <span>
                    <strong>{approvals.length} approval{approvals.length === 1 ? "" : "s"} ready</strong>
                    <small>Open when you are ready to review and decide.</small>
                  </span>
                </summary>
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
                      <PendingSubmitButton className="mini-button" name="decision" value="approved" pendingLabel="Saving…">Approve</PendingSubmitButton>
                      <PendingSubmitButton className="mini-button secondary-button" name="decision" value="changes_requested" pendingLabel="Saving…">Request changes</PendingSubmitButton>
                      <PendingSubmitButton className="mini-button danger-button" name="decision" value="rejected" pendingLabel="Saving…">Reject</PendingSubmitButton>
                    </div>
                  </form>
                ))}
              </div>
              </details>
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
                      ? turn.href === "/app/expenses" ? "Attach files" : "Needs your answer"
                      : turn.blocked.length
                        ? "Needs attention"
                        : turn.runId
                          ? "Prepared"
                          : turn.intent === "read_only"
                            ? "Checked"
                            : turn.intent === "document_intake"
                              ? "Imported"
                              : "Handled"}
                  </span>
                  <FerocityAnswer message={turn.message} />
                </div>
                {turn.uploaded?.length ? (
                  <div className="ferocity-upload-results">
                    <p className="eyebrow">Files received</p>
                    {turn.uploaded.map((file) => (
                      <span key={`${file.name}-${file.status}`}>
                        <FileText size={14} /> {file.name} ·{" "}
                        {documentStatusLabel(file.status)}
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
                {turn.artifacts?.length ? (
                  <div className="ferocity-result-section">
                    <p className="eyebrow">{turn.artifacts.some((artifact) => artifact.status === "completed") ? "Finished work" : "Prepared work"}</p>
                    <div className="button-row">
                      {turn.artifacts.map((artifact) => (
                        <Link className="mini-button" href={artifact.href} key={artifact.id}>
                          {artifact.title} <ArrowRight size={13} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="button-row">
                  {turn.runId && !turn.needsInput && !turn.artifacts?.some((artifact) => artifact.href === `/app/ai-workforce/results/${turn.runId}`) ? (
                    <Link
                      className="mini-button"
                      href={`/app/ai-workforce/results/${turn.runId}`}
                    >
                      Open command details <ArrowRight size={13} />
                    </Link>
                  ) : null}
                  {turn.href ? (
                    <Link className={`mini-button ${turn.runId && !turn.needsInput ? "secondary-button" : ""}`} href={turn.href}>
                      {turn.actionLabel ?? (turn.href === "/app/expenses"
                        ? "Review receipts & statements"
                        : "Open the finished work")} <ArrowRight size={13} />
                    </Link>
                  ) : null}
                  {turn.runId && turn.needsInput ? (
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

        {pending && submittedCommand ? (
          <article className="ferocity-chat-message ferocity-chat-message-owner" aria-label="Your message was sent">
            <div className="ferocity-chat-bubble">
              <p>{submittedCommand}</p>
            </div>
          </article>
        ) : null}

        {pending ? (
          <article className="ferocity-chat-message ferocity-chat-message-ai">
            <span className="ferocity-chat-avatar">
              <Sparkles size={18} />
            </span>
            <div className="ferocity-chat-bubble ferocity-chat-thinking" role="status">
              {requestDelayed ? (
                <>
                  <strong>This request is taking longer than normal.</strong>
                  <p>Ferocity has not marked it complete. Reload to check the durable conversation record before retrying, so work is not duplicated.</p>
                  <button className="mini-button secondary-button" type="button" onClick={() => window.location.reload()}>
                    Reload conversation status
                  </button>
                </>
              ) : "Ferocity is checking the business and preparing the next action…"}
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
                    {formatWorkspaceTime(item.occurredAt, workspaceTimeZone, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
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
        <input type="hidden" name="onboardingIndustry" value={guideIndustry} />
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
          accept="image/*,application/pdf,.csv,.tsv,.txt,.xlsx,.xml,.ofx,.qfx,.qbo"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            const selectionError = validateExpenseDocumentSelection(files);
            if (selectionError) {
              event.currentTarget.value = "";
              setAttachmentNames([]);
              setVoiceStatus(selectionError);
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
            Tell Ferocity what to do or ask a question
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
                (command.trim().length >= 2 || attachmentNames.length > 0)
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
            autoFocus
            aria-describedby="ferocity-composer-hint"
          />
          <small className="ferocity-composer-hint" id="ferocity-composer-hint">
            Enter sends · Shift+Enter adds a line · 15 MB per file, 25 files per batch
          </small>
        </div>
        <button
          className="button"
          type="submit"
          disabled={pending || (command.trim().length < 2 && attachmentNames.length === 0)}
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
      {!command.trim() && !pending && showSuggestions ? (
        <div className="ferocity-chat-suggestions" aria-label={latestRecommendations.length ? "Relevant next actions" : "Quick actions"}>
          {latestRecommendations.length ? latestRecommendations.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => {
                setCommand(item.command);
                requestAnimationFrame(() => composerRef.current?.querySelector("textarea")?.focus());
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.why}</span>
            </button>
          )) : turns.length === 0 && guideStep === "idle" ? (onboardingMode ? [
            "Find my biggest bottleneck", "Add a customer", "Create a job", "Schedule work", "Log an expense"
          ] : [
            "Lead the business and handle the top priority",
            "Handle every safe action and show me decisions only",
            "Find the next three revenue or cash opportunities"
          ]).map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => {
                setCommand(`${suggestion}. Ask me only for the details Ferocity does not already know.`);
                requestAnimationFrame(() => composerRef.current?.querySelector("textarea")?.focus());
              }}
            >
              {suggestion}
            </button>
          )) : null}
        </div>
      ) : null}
      {turns.length === 0 && guideStep === "idle" && !command.trim() && onboardingMode ? (
        <div className="ferocity-goal-grid" aria-label="Choose what you want to accomplish">
          {ferocityGoals.map((goal) => (
            <button type="button" key={goal.key} onClick={() => chooseGoal(goal)}>
              <strong>{goal.label}</strong>
              <span>{goal.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="ferocity-chat-footer">
        <p className="ferocity-chat-footnote">
          {customerMode === "active_customer" || customerMode === "internal_operator"
            ? "Ferocity carries authorized work through connected workflows and returns only missing information, approvals, or unavailable connections. "
            : "Ferocity can evaluate the business now and make the required execution path explicit. "}
          {workspaceRole === "owner"
            ? "Spending, publishing, payments, customer-facing messages, and other consequential actions remain visibly approval-controlled."
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
