export type QualificationQuestion = {
  id: string;
  required: boolean;
  scoringJson: unknown;
};

function scoreIfAnswered(value: unknown) {
  if (!value || typeof value !== "object") return 10;
  const score = Number((value as Record<string, unknown>).scoreIfAnswered);
  return Number.isFinite(score) && score > 0 ? score : 10;
}

export function evaluateQualification(questions: QualificationQuestion[], rawAnswers: Record<string, unknown>) {
  const answers = Object.fromEntries(
    questions.map((question) => [question.id, String(rawAnswers[question.id] ?? "").trim()])
  );
  const missingRequired = questions.filter((question) => question.required && !answers[question.id]).length;
  const maximumScore = questions.reduce((total, question) => total + scoreIfAnswered(question.scoringJson), 0);
  const earnedScore = questions.reduce(
    (total, question) => total + (answers[question.id] ? scoreIfAnswered(question.scoringJson) : 0),
    0
  );
  const leadScore = maximumScore ? Math.round((earnedScore / maximumScore) * 100) : 0;
  const qualificationStatus = missingRequired > 0 ? "needs_review" : leadScore >= 60 ? "qualified" : "unqualified";
  return { answers, missingRequired, leadScore, qualificationStatus };
}
