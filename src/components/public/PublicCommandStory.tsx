import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

const examples = [
  "What needs my attention today?",
  "Follow up with every estimate we're about to lose.",
  "Collect everything that's overdue.",
  "Turn our completed jobs into a marketing campaign.",
  "Why did profit fall last month?"
];

export function PublicCommandStory() {
  return (
    <section className="panel public-command-story">
      <div>
        <p className="eyebrow">One front door to your entire business</p>
        <h2>Just tell Ferocity what you need.</h2>
        <p className="muted">
          You shouldn’t have to remember which screen, employee, AI agent, automation, or piece of software handles something. Ask for the outcome in normal words. Ferocity uses the shared Business Brain to coordinate the right people, AI employees, and systems.
        </p>
        <div className="public-command-examples" aria-label="Example Ferocity commands">
          {examples.map((example) => <span key={example}>{example}</span>)}
        </div>
        <p className="public-command-outcome">You ask for the outcome. Ferocity figures out how to get there.</p>
      </div>

      <div className="public-command-preview" aria-label="Example Ask Ferocity result">
        <div className="public-command-label"><Sparkles size={16} /> Ask or tell Ferocity</div>
        <div className="public-command-prompt">
          Follow up with every estimate we&apos;re about to lose, within our rules.
        </div>
        <div className="public-command-result">
          <strong>Ferocity coordinated the work</strong>
          <span><CheckCircle2 size={15} /> 12 estimates reviewed</span>
          <span><CheckCircle2 size={15} /> 8 authorized follow-ups advanced</span>
          <span><CheckCircle2 size={15} /> 2 decisions routed to the owner</span>
        </div>
        <Link className="mini-button" href="/demo">
          See Ferocity at work <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
