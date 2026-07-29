import { manualSmsHref } from "@/lib/communication/manual-sms";

export interface AssistedMessagingProvider {
  providerKey: string;
  displayName: string;
  openNativeSMS(phone: string, body: string): string;
  openGoogleVoice(): string;
  openEmailDraft(email: string, subject: string, body: string): string;
  copyMessage(body: string): string;
  openDialer(phone: string): string;
}

function emailHref(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const browserAssistedMessagingProvider: AssistedMessagingProvider = {
  providerKey: "browser_assisted",
  displayName: "Device and browser assisted",
  openNativeSMS(phone, body) {
    return manualSmsHref(phone, body);
  },
  openGoogleVoice() {
    return "https://voice.google.com/u/0/messages";
  },
  openEmailDraft(email, subject, body) {
    return emailHref(email, subject, body);
  },
  copyMessage(body) {
    return body;
  },
  openDialer(phone) {
    return `tel:${phone}`;
  }
};
