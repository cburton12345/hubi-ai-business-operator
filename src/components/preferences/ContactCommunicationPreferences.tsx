import { saveContactCommunicationPreferenceAction } from "@/app/app/preferences/actions";
import type { ContactCommunicationPreference } from "@/lib/preferences/contact-communication-preferences";

export function ContactCommunicationPreferences(props: {
  contactKey: string;
  returnPath: string;
  value: ContactCommunicationPreference;
}) {
  return (
    <details className="section-actions">
      <summary>Contact preferences</summary>
      <form action={saveContactCommunicationPreferenceAction} className="form-stack section-actions">
        <input name="contactKey" type="hidden" value={props.contactKey} />
        <input name="returnPath" type="hidden" value={props.returnPath} />
        <div className="form-grid two">
          <label>Preferred method
            <select name="preferredMethod" defaultValue={props.value.preferredMethod}>
              <option value="native_sms">Native SMS app</option>
              <option value="automatic_sms">Automatic SMS</option>
              <option value="google_voice">Google Voice</option>
              <option value="email">Email</option>
              <option value="ai_voice_call">AI voice call</option>
              <option value="human_call">Human call</option>
            </select>
          </label>
          <label>Language
            <input name="preferredLanguage" defaultValue={props.value.preferredLanguage} placeholder="Auto-detect or English" />
          </label>
          <label>Quiet hours start<input name="quietHoursStart" type="time" defaultValue={props.value.quietHoursStart} /></label>
          <label>Quiet hours end<input name="quietHoursEnd" type="time" defaultValue={props.value.quietHoursEnd} /></label>
          <label>Best contact time<input name="bestContactTime" defaultValue={props.value.bestContactTime} placeholder="Weekdays after 4 PM" /></label>
          <label>Preferred employee<input name="preferredEmployee" defaultValue={props.value.preferredEmployee} /></label>
          <label>Department<input name="department" defaultValue={props.value.department} /></label>
        </div>
        <label className="checkbox-row"><input name="callBeforeTexting" type="checkbox" defaultChecked={props.value.callBeforeTexting} /> Call before texting</label>
        <label className="checkbox-row"><input name="noMarketingTexts" type="checkbox" defaultChecked={props.value.noMarketingTexts} /> No marketing texts</label>
        <label className="checkbox-row"><input name="noAiCalls" type="checkbox" defaultChecked={props.value.noAiCalls} /> No AI calls</label>
        <button className="mini-button" type="submit">Save preferences</button>
      </form>
    </details>
  );
}
