export function ensureJsonInstruction(system: string) {
  return /\bjson\b/i.test(system) ? system : `${system.trim()} Return JSON only.`;
}
