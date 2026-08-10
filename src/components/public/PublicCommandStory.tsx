import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

const examples = [
  "What needs my attention today?",
  "Follow up with every estimate losing momentum.",
  "Turn this completed job into an ad campaign.",
  "Why did profit fall last month?"
];

export function PublicCommandStory() {
  return (
    <section className="panel public-command-story">
      <div>
        <p className="eyebrow">One front door to the entire business</p>
        <h2>Ask Ferocity anything. Tell Ferocity what you want done.</h2>
        <p className="muted">
          Owners do not have to hunt through menus or learn which tool handles the job. Ask a question in normal words or describe the outcome you want. Ferocity reads the shared Business Brain, coordinates the right AI employees and business systems, prepares or completes authorized work, and shows exactly what happened.
        </p>
        <div className="public-command-examples" aria-label="Example Ferocity commands">
          {examples.map((example) => <span key={example}>{example}</span>)}
        </div>
      </div>

      <div className="public-command-preview" aria-label="Example Ask Ferocity result">
        <div className="public-command-label"><Sparkles size={16} /> Ask or tell Ferocity</div>
        <div className="public-command-prompt">
          Find every estimate at risk, follow up within our rules, and show me anything that needs my decision.
        </div>
        <div className="public-command-result">
          <strong>Ferocity coordinated the work</strong>
          <span><CheckCircle2 size={15} /> 12 estimates reviewed</span>
          <span><CheckCircle2 size={15} /> 8 approved follow-ups prepared</span>
          <span><CheckCircle2 size={15} /> 2 decisions routed to the owner</span>
        </div>
        <Link className="mini-button" href="/demo">
          See Ferocity at work <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
