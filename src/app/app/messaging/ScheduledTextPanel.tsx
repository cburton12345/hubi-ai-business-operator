"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  cancelScheduledTextAction,
  createScheduledTextAction,
  updateScheduledTextAction,
  type ScheduledTextActionState
} from "./actions";

type ProviderOption = { key: string; label: string };
type ScheduledText = { id: string; providerKey: string; recipient: string; body: string; status: string; scheduledFor: string };

const initialState: ScheduledTextActionState = { ok: false, message: "" };

function ScheduleFields({ allowKeep = false }: { allowKeep?: boolean }) {
  const [mode, setMode] = useState(allowKeep ? "keep" : "tomorrow_morning");
  return (
    <>
      <label>
        Send time
        <select name="scheduleMode" value={mode} onChange={(event) => setMode(event.target.value)}>
          {allowKeep ? <option value="keep">Keep current time</option> : null}
          <option value="now">Send now</option>
          <option value="tomorrow_morning">Tomorrow at 8:30 AM</option>
          <option value="next_business_morning">Next business day at 8:30 AM</option>
          <option value="custom">Choose a time</option>
        </select>
      </label>
      {mode === "custom" ? <label>Custom local time<input name="customLocal" type="datetime-local" required /></label> : null}
    </>
  );
}

export function ScheduledTextPanel({
  providers,
  scheduledTexts,
  timezone,
  lateNow
}: {
  providers: ProviderOption[];
  scheduledTexts: ScheduledText[];
  timezone: string;
  lateNow: boolean;
}) {
  const [state, action, pending] = useActionState(createScheduledTextAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="panel section-actions">
      <div className="list-row flush-row">
        <div>
          <h2>Write now. Send at the right time.</h2>
          <p className="muted">
            Schedule a one-to-one text through the existing Messaging Engine. Ferocity checks consent, STOP requests,
            provider health, quiet hours, duplicates, and authorization again when the message is actually sent.
          </p>
        </div>
        <span className="pill">{timezone}</span>
      </div>

      {lateNow ? <p className="muted">It is late in this workspace. Tomorrow at 8:30 AM is selected so you can write the message now without waking anyone.</p> : null}
      {providers.length ? (
        <form action={action} className="form-stack section-actions" ref={formRef}>
          <div className="two-col">
            <label>Phone number<input name="recipient" placeholder="+17155551234" required /></label>
            <label>
              Send with
              <select name="providerKey" defaultValue={providers[0]?.key}>
                {providers.map((provider) => <option key={provider.key} value={provider.key}>{provider.label}</option>)}
              </select>
            </label>
          </div>
          <label>Message<textarea name="body" maxLength={1600} placeholder="Write the message while it is on your mind…" required rows={4} /></label>
          <div className="two-col"><ScheduleFields /><button className="button" disabled={pending} type="submit">{pending ? "Scheduling…" : "Schedule message"}</button></div>
          {state.message ? <p className={state.ok ? "muted" : "danger-text"}>{state.message}</p> : null}
        </form>
      ) : <p className="danger-text">Connect and enable Ferocity Connect or another SMS provider before scheduling messages.</p>}

      <div className="section-actions">
        <h3>Upcoming messages</h3>
        <ul className="list">
          {scheduledTexts.map((message) => (
            <li className="list-row" key={message.id}>
              <div>
                <p>{message.body}</p>
                <p className="muted">{message.recipient} / {message.scheduledFor} / {message.providerKey.replaceAll("_", " ")}</p>
              </div>
              <div className="inline-actions"><span className="pill">{message.status.replaceAll("_", " ")}</span></div>
              <details>
                <summary>Edit or cancel</summary>
                <form action={updateScheduledTextAction} className="form-stack section-actions">
                  <input name="actionId" type="hidden" value={message.id} />
                  <div className="two-col">
                    <label>Phone number<input defaultValue={message.recipient} name="recipient" required /></label>
                    <label>
                      Send with
                      <select defaultValue={message.providerKey} name="providerKey">
                        {providers.map((provider) => <option key={provider.key} value={provider.key}>{provider.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>Message<textarea defaultValue={message.body} maxLength={1600} name="body" required rows={3} /></label>
                  <div className="two-col"><ScheduleFields allowKeep /><button className="mini-button" type="submit">Save changes</button></div>
                </form>
                <form action={cancelScheduledTextAction} className="section-actions">
                  <input name="actionId" type="hidden" value={message.id} />
                  <button className="mini-button secondary-button" type="submit">Cancel scheduled message</button>
                </form>
              </details>
            </li>
          ))}
          {!scheduledTexts.length ? <li className="list-row"><span className="muted">Nothing scheduled yet.</span></li> : null}
        </ul>
      </div>
    </section>
  );
}
