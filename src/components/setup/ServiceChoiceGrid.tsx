import Link from "next/link";
import { CheckCircle2, Circle, LockKeyhole, PauseCircle, PlugZap } from "lucide-react";
import type { SetupVerticalRow } from "@/lib/setup/get-operator-setup";
import { updateVerticalStatusAction } from "@/app/app/setup/actions";

function serviceState(vertical: SetupVerticalRow) {
  if (!vertical.planAllowed) {
    return {
      label: "Upgrade to unlock",
      tone: "high",
      icon: <LockKeyhole size={16} />,
      help: vertical.planRule
    };
  }

  if (vertical.status === "active") {
    return {
      label: "Active",
      tone: "",
      icon: <CheckCircle2 size={16} />,
      help: "Ferocity is set to help with this."
    };
  }

  if (vertical.status === "paused") {
    return {
      label: "Paused",
      tone: "medium",
      icon: <PauseCircle size={16} />,
      help: "Included, but paused until you turn it back on."
    };
  }

  if (vertical.steps.some((step) => step.requiresProvider)) {
    return {
      label: "Available",
      tone: "medium",
      icon: <PlugZap size={16} />,
      help: "Ferocity can start safely. Some live actions need connections."
    };
  }

  return {
    label: "Available",
    tone: "medium",
    icon: <Circle size={16} />,
    help: "Included in this workspace. Turn it on when useful."
  };
}

function nextHref(vertical: SetupVerticalRow) {
  return vertical.steps.find((step) => step.href)?.href ?? "/app/setup";
}

export function ServiceChoiceGrid({ verticals }: { verticals: SetupVerticalRow[] }) {
  return (
    <div className="service-choice-grid">
      {verticals.map((vertical) => {
        const state = serviceState(vertical);
        const active = vertical.status === "active";

        return (
          <section className="service-choice-card" key={vertical.key}>
            <div className="list-row flush-row">
              <div className="inline-title">
                {state.icon}
                <div>
                  <h3>{vertical.name}</h3>
                  <p className="muted">{vertical.description}</p>
                </div>
              </div>
              <span className={`pill ${state.tone}`}>{state.label}</span>
            </div>
            <p className="muted">{state.help}</p>
            <div className="service-choice-actions">
              {vertical.planAllowed ? (
                <form action={updateVerticalStatusAction}>
                  <input name="verticalKey" type="hidden" value={vertical.key} />
                  <input name="status" type="hidden" value={active ? "paused" : "active"} />
                  <input name="priority" type="hidden" value={active ? vertical.priority : "high"} />
                  <input name="notes" type="hidden" value={active ? "Paused from service menu." : "Turned on from service menu."} />
                  <button className={active ? "mini-button secondary-button" : "mini-button"} type="submit">
                    {active ? "Pause" : "Use this"}
                  </button>
                </form>
              ) : (
                <Link className="mini-button" href="/pricing">
                  See plans
                </Link>
              )}
              <Link className="mini-button secondary-button" href={nextHref(vertical)}>
                Open
              </Link>
            </div>
          </section>
        );
      })}
    </div>
  );
}
