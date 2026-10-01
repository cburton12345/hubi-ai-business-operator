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
        <p className="eyebrow">See how Ferocity would help your business</p>
        <h2>Tell Ferocity what you run. Get a practical first plan.</h2>
        <p className="muted">
          Describe the business, a goal, a weak spot, or a capability you wish you had. Ferocity will identify the most useful first moves, explain what it could improve or build, and show where it can begin—without making you choose a tool first.
        </p>
        <div className="public-command-examples" aria-label="Example Ferocity commands">
          {examples.map((example) => <span key={example}>{example}</span>)}
        </div>
        <p className="public-command-outcome">No form first. No sales call required. Just ask the question.</p>
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
