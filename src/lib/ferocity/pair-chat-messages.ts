export type PairableFerocityMessage = {
  id: string;
  role: "owner" | "ferocity" | "system";
};

export function pairFerocityChatMessages<T extends PairableFerocityMessage>(messages: readonly T[]) {
  const exchanges: Array<{ owner: T; answer: T | null }> = [];
  let current: { owner: T; answer: T | null } | null = null;

  for (const message of messages) {
    if (message.role === "owner") {
      current = { owner: message, answer: null };
      exchanges.push(current);
      continue;
    }
    if (message.role === "ferocity" && current && !current.answer) {
      current.answer = message;
    }
  }

  return exchanges;
}
