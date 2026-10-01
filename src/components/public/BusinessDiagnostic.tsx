"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

const businessTypes = ["Professional services", "Trades / field service", "Retail / ecommerce", "Agency", "Other"];
const bottlenecks = ["More opportunities", "Faster follow-up", "Work and scheduling", "Cash and collections", "Marketing", "Too much depends on me"];

export function BusinessDiagnostic() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState("");
  const [bottleneck, setBottleneck] = useState("");

  function continueToFerocity() {
    const query = new URLSearchParams();
    if (businessType) query.set("businessType", businessType);
    if (bottleneck) query.set("bottleneck", bottleneck);
    router.push(`/ask-ferocity?${query.toString()}`);
  }

  return (
    <section className="panel business-diagnostic" aria-labelledby="diagnostic-title">
      <div>
        <p className="eyebrow">Find the first move</p>
        <h2 id="diagnostic-title">What kind of business do you run—and what is holding it back?</h2>
        <p className="muted">Choose a starting point. Ferocity will ask only what it needs, then show what it would improve first.</p>
      </div>
      <fieldset>
        <legend>Business type</legend>
        <div className="diagnostic-options">
          {businessTypes.map((item) => <button aria-pressed={businessType === item} key={item} onClick={() => setBusinessType(item)} type="button">{item}</button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>First result you want</legend>
        <div className="diagnostic-options">
          {bottlenecks.map((item) => <button aria-pressed={bottleneck === item} key={item} onClick={() => setBottleneck(item)} type="button">{item}</button>)}
        </div>
      </fieldset>
      <button className="button" data-track-event="diagnostic_complete" disabled={!businessType && !bottleneck} onClick={continueToFerocity} type="button">
        Ask Ferocity <ArrowRight size={16} />
      </button>
    </section>
  );
}
