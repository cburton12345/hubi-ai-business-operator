export type WalkthroughObservationSeed = {
  observationType: "damage" | "customer_request" | "material" | "labor" | "safety" | "measurement" | "asset" | "open_question" | "finding";
  title: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  material: string | null;
  locationReference: string | null;
  confidence: "high" | "medium" | "low";
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50
};

const damageTerms = ["damage", "damaged", "missing", "cracked", "hail", "wind", "water", "leak", "exposing", "rot", "broken"];
const safetyTerms = ["unsafe", "danger", "safety", "electrical", "mold", "fall", "trip", "hazard", "structural"];
const customerTerms = ["customer wants", "wants", "requested", "prefers", "color", "white", "black", "upgrade"];
const materialTerms = ["shingle", "siding", "fascia", "soffit", "gutter", "downspout", "window", "door", "vent boot", "flashing", "chimney"];
const locationTerms = ["north", "south", "east", "west", "front", "back", "rear", "left", "right", "slope", "side", "garage", "kitchen", "bathroom"];

function quantityFromText(text: string) {
  const digit = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digit) return Number(digit[1]);
  const word = Object.entries(numberWords).find(([key]) => new RegExp(`\\b${key}\\b`, "i").test(text));
  return word ? word[1] : null;
}

function unitFromText(text: string) {
  if (/\b(lf|linear feet|feet|ft)\b/i.test(text)) return "LF";
  if (/\b(sheet|sheets)\b/i.test(text)) return "sheet";
  if (/\b(window|windows)\b/i.test(text)) return "window";
  if (/\b(door|doors)\b/i.test(text)) return "door";
  if (/\b(downspout|downspouts)\b/i.test(text)) return "downspout";
  return null;
}

function materialFromText(text: string) {
  return materialTerms.find((term) => text.toLowerCase().includes(term)) ?? null;
}

function locationFromText(text: string) {
  const lower = text.toLowerCase();
  const found = locationTerms.filter((term) => lower.includes(term));
  return found.length ? found.join(" ") : null;
}

function observationType(text: string): WalkthroughObservationSeed["observationType"] {
  const lower = text.toLowerCase();
  if (safetyTerms.some((term) => lower.includes(term))) return "safety";
  if (customerTerms.some((term) => lower.includes(term))) return "customer_request";
  if (damageTerms.some((term) => lower.includes(term))) return "damage";
  if (quantityFromText(text) !== null) return "measurement";
  if (materialFromText(text)) return "material";
  if (lower.includes("?")) return "open_question";
  return "finding";
}

function titleFromText(text: string) {
  const material = materialFromText(text);
  const location = locationFromText(text);
  const clean = text.replace(/\s+/g, " ").trim();
  if (material && location) return `${material[0].toUpperCase()}${material.slice(1)} / ${location}`;
  if (material) return `${material[0].toUpperCase()}${material.slice(1)} item`;
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function confidenceFor(text: string) {
  if (quantityFromText(text) !== null && materialFromText(text)) return "high" as const;
  if (materialFromText(text) || damageTerms.some((term) => text.toLowerCase().includes(term))) return "medium" as const;
  return "low" as const;
}

export function analyzeWalkthroughTranscript(transcript: string): WalkthroughObservationSeed[] {
  return transcript
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40)
    .map((line) => ({
      observationType: observationType(line),
      title: titleFromText(line),
      description: line,
      quantity: quantityFromText(line),
      unit: unitFromText(line),
      material: materialFromText(line),
      locationReference: locationFromText(line),
      confidence: confidenceFor(line)
    }));
}

export function estimateLineFromObservation(observation: WalkthroughObservationSeed) {
  const action = observation.observationType === "customer_request" ? "Customer request" : observation.observationType === "safety" ? "Review safety concern" : "Repair / replace";
  const subject = observation.material ?? observation.title;
  return `${action}: ${subject}`;
}
