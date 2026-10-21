const technicalNoticePatterns = [
  "Workspace evidence was still checked, but AI action planning used the safe fallback. I did not execute an inferred action plan.",
  "Workspace evidence was checked, but the evidence-synthesis model was unavailable. The response below uses the safe interpretation plus the verified facts listed with it.",
] as const;

export function presentFerocityMessage(value: string) {
  let message = value.trim();
  const technicalNotices: string[] = [];

  for (const notice of technicalNoticePatterns) {
    if (!message.includes(notice)) continue;
    technicalNotices.push(notice);
    message = message.replace(notice, "");
  }

  return {
    message: message.replace(/\n{3,}/g, "\n\n").trim(),
    technicalNotices,
  };
}
