import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

const examples = [
  "What's the biggest bottleneck in my business right now?",
  "What needs my attention today?",
  "Follow up with every estimate we're about to lose.",
  "Collect everything that's overdue.",
  "Turn our completed jobs into a marketing campaign.",
  "Why did profit fall last month?"
];

export function PublicCommandStory({ children }: { children?: ReactNode }) {
  return (
    <section className="panel public-command-story" id="ask-ferocity">
      <div>
        <p className="eyebrow">Continue with the real Ask Ferocity experience</p>
        <h2>Diagnose the problem, clarify the economics, and move toward a useful next action.</h2>
        <p className="muted">
          Describe the business, a goal, a weak spot, or a capability you wish you had. Ferocity will ask only for the context it needs, identify a practical path, explain what it can actually handle, and make the next step obvious—without making you choose a tool first.
        </p>
        <div className="public-command-examples" aria-label="Example Ferocity commands">
          {examples.map((example) => <span key={example}>{example}</span>)}
        </div>
        <p className="public-command-outcome">No generic feature tour. Ask the question and move toward a concrete evaluation or action.</p>
      </div>

      {children ?? <div className="public-command-preview" aria-label="Example Ask Ferocity result">
        <div className="public-command-label"><Sparkles size={16} /> Ask or tell Ferocity</div>
        <div className="public-command-prompt">
          Follow up with every estimate we&apos;re about to lose, within our rules.
        </div>
        <div className="public-command-result">
          <strong>Ferocity coordinated the work</strong>
          <span><CheckCircle2 size={15} /> 12 estimates reviewed</span>
          <span><CheckCircle2 size={15} /> 8 approved follow-ups prepared</span>
          <span><CheckCircle2 size={15} /> 2 decisions routed to the owner</span>
        </div>
        <Link className="mini-button" href="/demo">
          Explore how Ferocity works <ArrowRight size={14} />
        </Link>
      </div>}
    </section>
  );
}
