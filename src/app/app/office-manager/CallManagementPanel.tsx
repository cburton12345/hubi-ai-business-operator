import { getCallManagementDashboard } from "@/lib/office-manager/get-call-management";
import {
  createCustomCallModeAction,
  setCallHandlingModeAction,
  setOwnerAttentionStateAction
} from "./actions";

type Dashboard = Awaited<ReturnType<typeof getCallManagementDashboard>>;

const attentionChoices = [
  ["available", "Available", 0],
  ["busy", "Busy", 120],
  ["driving", "Driving", 60],
  ["on_job", "On a job", 240],
  ["focus", "Focus", 120],
  ["meeting", "Meeting", 60],
  ["lunch", "Lunch", 60],
  ["vacation", "Vacation", 0],
  ["emergency_only", "Emergency only", 120]
] as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function CallManagementPanel({ dashboard }: { dashboard: Dashboard }) {
  const currentMode = dashboard.modes.find((mode) => mode.isDefault);
  return (
    <section className="panel section-actions">
      <div className="list-row flush-row">
        <div>
          <p className="eyebrow">Protect your attention</p>
          <h2>Decide which calls deserve you</h2>
          <p className="muted">
            Ferocity handles routine calls, explains important ones before transferring, and remembers how you want calls handled.
          </p>
        </div>
        <div className="status-card">
          <span>Current behavior</span>
          <strong>{currentMode?.displayName ?? "AI answers first"}</strong>
          <span>You are {label(dashboard.attentionState)}</span>
        </div>
      </div>

      <div>
        <h3>What are you doing now?</h3>
        <p className="muted">Change this here in one click. Temporary choices expire automatically when a duration is set.</p>
        <div className="button-row">
          {attentionChoices.map(([state, text, minutes]) => (
            <form action={setOwnerAttentionStateAction} key={state}>
              <input name="state" type="hidden" value={state} />
              <input name="durationMinutes" type="hidden" value={minutes} />
              <button className={`button ${dashboard.attentionState === state ? "" : "secondary-button"}`} type="submit">
                {text}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div>
        <h3>How should incoming calls work?</h3>
        <p className="muted">{currentMode?.description ?? "AI handles routine calls and brings in a person when needed."}</p>
        <form action={setCallHandlingModeAction} className="form-grid">
          <label>
            Current call mode
            <select defaultValue={currentMode?.id} name="modeId">
              {dashboard.modes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.displayName}</option>
              ))}
            </select>
          </label>
          <button className="button secondary-button" type="submit">Save call mode</button>
        </form>
      </div>

      <details>
        <summary>Advanced: create a custom call mode</summary>
        <form action={createCustomCallModeAction} className="form-grid section-actions">
          <label>
            Name
            <input name="displayName" placeholder="Example: Estimates only" required />
          </label>
          <label>
            What it does
            <input name="description" placeholder="AI handles routine calls and transfers qualified estimates." />
          </label>
          <label>
            Call behavior
            <select defaultValue="important_only" name="handlingStrategy">
              <option value="ai_first">AI answers first</option>
              <option value="simultaneous">Ring owner and AI together</option>
              <option value="owner_first">Owner first, AI backup</option>
              <option value="important_only">Only important calls interrupt</option>
              <option value="ai_unless_requested">AI unless the caller asks</option>
              <option value="presence_based">Follow my availability</option>
              <option value="schedule_based">Follow my schedule</option>
              <option value="custom">Custom rules</option>
            </select>
          </label>
          <label>
            When it applies
            <select defaultValue="always" name="schedule">
              <option value="always">All the time</option>
              <option value="business_hours">During business hours</option>
              <option value="after_hours">After hours</option>
              <option value="weekends">Weekends</option>
            </select>
          </label>
          <label>
            Minimum importance (0–100)
            <input defaultValue="75" max="100" min="0" name="minimumTransferScore" type="number" />
          </label>
          <label>
            Minimum sales value
            <input defaultValue="0" min="0" name="minimumSalesValueDollars" step="1" type="number" />
          </label>
          <fieldset>
            <legend>Calls that may interrupt you</legend>
            <div className="button-row">
              {["emergency", "urgent", "sales_opportunity", "vip", "warranty", "supplier", "employee", "existing_customer"].map((category) => (
                <label key={category}>
                  <input defaultChecked={["emergency", "urgent", "sales_opportunity", "vip"].includes(category)} name={`category:${category}`} type="checkbox" />
                  {label(category)}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="button" type="submit">Save custom mode</button>
        </form>
      </details>
    </section>
  );
}
