"use client";

import { createElement, useEffect, useState } from "react";

export function PublicBotChallenge({ action }: { action: "access_request" }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("altcha")
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="form-bot-verification" aria-live="polite">
      {ready
        ? createElement("altcha-widget", {
            auto: "onsubmit",
            challenge: `/api/security/challenge?action=${encodeURIComponent(action)}`,
            name: "altcha",
            type: "native",
            workers: 2
          })
        : <p className={failed ? "form-error" : "muted"}>
            {failed ? "Browser verification could not load. Refresh this page before submitting." : "Preparing secure browser verification…"}
          </p>}
    </div>
  );
}
