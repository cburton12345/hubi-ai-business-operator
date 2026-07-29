export type A2pRegistrationInput = {
  legalBusinessName: string;
  dbaName?: string;
  businessType: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  websiteUrl: string;
  messagingUseCase: string;
  expectedVolume: string;
  optInMethod: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  sampleMessageOne?: string;
  sampleMessageTwo?: string;
};

function businessName(input: A2pRegistrationInput) {
  return input.dbaName?.trim() || input.legalBusinessName.trim();
}

export function generateA2pRegistrationPacket(input: A2pRegistrationInput) {
  const name = businessName(input);
  const useCase = input.messagingUseCase.trim() || "customer service, appointment reminders, estimate follow-up, invoice reminders, and review requests";
  const optIn = input.optInMethod.trim() || "customers request service through a website form, phone call, signed estimate, invoice, or direct business relationship";
  const sampleOne =
    input.sampleMessageOne?.trim() ||
    `Hi {{first_name}}, this is ${name}. Thanks for reaching out. Are you still looking for help with {{service}}? Reply STOP to opt out.`;
  const sampleTwo =
    input.sampleMessageTwo?.trim() ||
    `Hi {{first_name}}, reminder from ${name}: your appointment is scheduled for {{appointment_time}}. Reply HELP for help or STOP to opt out.`;

  return {
    campaignDescription:
      `${name} uses messaging for ${useCase}. Messages are sent only to customers, leads, or contacts with an existing relationship or clear opt-in. ` +
      `Ferocity prepares and logs messages, but live sending remains behind provider readiness, consent, approval, and opt-out controls.`,
    optInWording:
      `By submitting this form or requesting service from ${name}, you agree to receive text messages about your request, appointments, estimates, invoices, and service updates. Message and data rates may apply. Reply STOP to opt out or HELP for help.`,
    stopHelpWording: {
      stop: `You have opted out of text messages from ${name}. Reply START to opt back in.`,
      help: `${name}: reply STOP to opt out. For help, call the business directly or reply with your question.`
    },
    sampleMessages: [sampleOne, sampleTwo],
    complianceChecklist: [
      "Business name, address, website, and contact information are accurate.",
      "Website shows contact method and a privacy policy before live SMS.",
      "Opt-in language is visible where leads submit forms or request service.",
      "Messages include clear business identity.",
      "STOP and HELP handling are active before automated sending.",
      "No unrelated tenants share one A2P campaign."
    ],
    address: {
      line1: input.addressLine1,
      line2: input.addressLine2 || "",
      city: input.city,
      state: input.state,
      postalCode: input.postalCode
    },
    businessType: input.businessType,
    expectedVolume: input.expectedVolume,
    privacyPolicyUrl: input.privacyPolicyUrl || null,
    termsUrl: input.termsUrl || null,
    optInMethod: optIn
  };
}
