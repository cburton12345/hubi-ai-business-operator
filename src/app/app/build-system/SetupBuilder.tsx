"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { applySetupPlanAction, previewSetupPlanAction } from "./actions";
import type { SetupPlan } from "@/lib/setup/setup-planner";

type ActionState = {
  ok: boolean;
  error?: string;
  plan?: SetupPlan;
};

const initialState: ActionState = { ok: false };

function applyModeLabel(mode: string) {
  if (mode === "log_only") return "Will record for review";
  if (mode === "manual_review") return "Will prepare, then ask before anything goes live";
  if (mode === "future_provider") return "Needs a connected account first";
  return mode.replaceAll("_", " ");
}

function verticalStatusLabel(status: string) {
  if (status === "active") return "Turn on";
  if (status === "paused") return "Keep paused";
  if (status === "not_needed") return "Skip for now";
  return status.replaceAll("_", " ");
}

function assetStatusLabel(status: string) {
  if (status === "active") return "Ready to use";
  if (status === "draft") return "Draft only";
  if (status === "planned") return "Planned";
  if (status === "review_required") return "Needs approval";
  return status.replaceAll("_", " ");
}

function featureModeLabel(mode: string) {
  if (mode === "draft_only") return "Drafts only";
  if (mode === "review_required") return "Ask before use";
  return mode.replaceAll("_", " ");
}

export function SetupBuilder() {
  const [request, setRequest] = useState("I run a roofing company and want storm leads, reviews, SEO pages, and fast follow-up.");
  const [previewState, previewAction, previewPending] = useActionState(previewSetupPlanAction, initialState);
  const [applyState, applyAction, applyPending] = useActionState(applySetupPlanAction, initialState);
  const [activePlan, setActivePlan] = useState<SetupPlan | null>(null);

  useEffect(() => {
    if (previewState.ok && previewState.plan) setActivePlan(previewState.plan);
  }, [previewState]);

  useEffect(() => {
    if (applyState.ok && applyState.plan) setActivePlan(applyState.plan);
  }, [applyState]);

  return (
    <section className="setup-builder-grid">
      <form action={previewAction} className="panel form-stack setup-builder-input">
        <h2>Tell Ferocity What You Need</h2>
        <p className="muted">Use normal words. This first version creates a setup plan without spending AI tokens.</p>
        <textarea
          name="request"
          rows={8}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Example: I run a roofing company and want storm leads, review requests, missed-call text back, and invoice follow-up."
        />
        {previewState.error ? <p className="form-error">{previewState.error}</p> : null}
        <div className="button-row">
          <button className="button" type="submit" disabled={previewPending}>
            {previewPending ? "Building plan..." : "Preview changes"}
          </button>
          <button className="button secondary-button" type="button" onClick={() => setActivePlan(null)}>
            Edit plan
          </button>
          <Link className="button secondary-button" href="/app">
            Cancel
          </Link>
        </div>
      </form>

      <section className="panel setup-builder-preview">
        <div className="list-row flush-row">
          <div>
            <h2>Setup Plan</h2>
            <p className="muted">Nothing live changes until you apply. Applying this version records the plan for audit and future undo.</p>
          </div>
          <span className="pill">review first</span>
        </div>
        {activePlan ? (
          <div className="form-stack">
            <div>
              <p className="eyebrow">{activePlan.businessType}</p>
              <h3>{activePlan.goal}</h3>
              <p className="muted">{activePlan.summary}</p>
              <p className="muted">Template: {activePlan.templateName}</p>
            </div>
            <ul className="list">
              {activePlan.changes.map((change) => (
                <li className="list-row" key={`${change.area}-${change.title}`}>
                  <div>
                    <h3>{change.title}</h3>
                    <p className="muted">
                      {change.area} / {applyModeLabel(change.applyMode)}
                    </p>
                    <p>{change.summary}</p>
                  </div>
                  <div className="inline-actions">
                    <span className={`pill ${change.riskLevel}`}>{change.riskLevel}</span>
                    <Link className="mini-button" href={change.targetHref}>
                      Open settings
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <div className="two-col">
              <div>
                <h3>Settings Ferocity will update</h3>
                <ul className="plain-list">
                  {activePlan.verticalTargets.map((target) => (
                    <li key={target.verticalKey}>
                      {target.verticalKey.replaceAll("_", " ")}: {verticalStatusLabel(target.status)}, {target.priority} priority
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Controls Ferocity will keep safe</h3>
                <ul className="plain-list">
                  {activePlan.serviceTargets.map((target) => (
                    <li key={target.featureKey}>
                      {target.featureKey.replaceAll("_", " ")}: {featureModeLabel(target.mode)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <section>
              <h3>Assets Ferocity will create or prepare</h3>
              <ul className="list">
                {activePlan.assetTargets.map((asset) => (
                  <li className="list-row" key={`${asset.assetType}-${asset.title}`}>
                    <div>
                      <h3>{asset.title}</h3>
                      <p className="muted">
                        {asset.assetType.replaceAll("_", " ")} / {assetStatusLabel(asset.status)}
                      </p>
                      <p>{asset.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Questions Ferocity still needs answered</h3>
              <ul className="plain-list">
                {activePlan.followUpQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
            <div className="two-col">
              <div>
                <h3>Safe defaults</h3>
                <ul className="plain-list">
                  {activePlan.safeDefaults.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Blocked until ready</h3>
                <ul className="plain-list">
                  {activePlan.blockedUntil.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="muted">{activePlan.undoNote}</p>
            <form action={applyAction} className="button-row">
              <input name="request" type="hidden" value={request} />
              <button className="button" type="submit" disabled={applyPending}>
                {applyPending ? "Applying..." : "Apply changes"}
              </button>
              <button className="button secondary-button" type="submit" formAction={previewAction} disabled={previewPending}>
                Refresh preview
              </button>
            </form>
            {applyState.ok ? (
              <p className="success-panel panel">
                Plan applied. Ferocity created editable draft setup assets where needed, and live sends, publishing, ads, and sync are still gated.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No plan previewed yet</h3>
            <p className="muted">Describe the business or workflow, then preview the plan before applying anything.</p>
          </div>
        )}
      </section>
    </section>
  );
}
