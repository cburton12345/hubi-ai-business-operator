import type { AllocationSuggestion, AllocationTarget, StatementTransaction } from "./types";

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const unresolvedCategories = new Set(["", "uncategorized", "payment_needs_classification", "deposit_needs_classification"]);

export function categoryForStatementDescription(description: string) {
  const value = normalized(description);
  if (/\b(standard|instant|external) transfer\b/.test(value)) return "transfer";
  if (/^from .+ cash app payment$/.test(value)) return "deposit_needs_classification";
  if (/^to .+ cash app payment$/.test(value)) return "payment_needs_classification";
  if (/\b(synergy community|cenex|kwik trip|kwik star|caseys|bp|shell|speedway|exxon|mobil|quiktrip|qt |cefco|flying j|pilot|sunoco|circle k|conoco|holiday stations|maverik|murphy atwalmart|git n go|kum go|break time|brake time|7 eleven|love s|cr convenience|buc ee|marathon petro|petro beaumont|hardy valero|py e g|rocket saint louis|fuel|gas station)\b/.test(value)) return "fuel";
  if (/\b(menards|mnrd|home depot|homedepot|lowes|lumber|hardware|building supply|true value|ace hdwe|farm and home|farm home|fleet farm|farm flt|parts city|j h larson|carolina chemical|synergy ridgeland hard)\b/.test(value)) return "materials";
  if (/\b(advance auto|advanceautoparts|auto parts|auto supply|o reilly|tire|oil change|dmv|wi dot)\b/.test(value)) return "vehicle";
  if (/\b(hotel|motel|inn|lodging|airbnb|radisson|wyndham|comfort suites|resort|expedia)\b/.test(value)) return "lodging";
  if (/\b(restaurant|grill|cafe|coffee|mcdonalds|mcdonald s|subway|doordash|burger king|domino s|wingstop|pizza|hungry howies|jack in the box|little caesars|taco johns|taco bell|del taco|wendy s|arbys|a and w|dairy queen|china max|vending)\b/.test(value)) return "meals";
  if (/\b(google ads|facebook|meta ads|advertising)\b/.test(value)) return "advertising";
  if (/\b(office depot|officemax|office max|staples|usps|post office)\b/.test(value)) return "office";
  if (/\b(utility|electric|water|sewer|internet|phone|landfill|landfil|sanitary|xcel energy|xcelenergy|pass n trash|t mobile|bemobile|frontier web)\b/.test(value)) return "utilities";
  if (/\b(openai|chatgpt|hostinger|software|web hosting|rentredi)\b/.test(value)) return "software";
  if (/\b(homesite ins|insurance premium|ins prem|geico auto|ameritasinsgr)\b/.test(value)) return "insurance";
  if (/\b(vevor|best buy|equipment)\b/.test(value)) return "equipment_needs_receipt";
  if (/\b(amazon|walmart|wal mart|wm supercenter|wmt plus|target|dollar general|dollar gen|dollartree|dollar tree|five below|market food|marketplace foods|festival foods|nilssen|pick n save|brookshire|tjmaxx|ebay|kyle s market|dick s fresh market|price chopper|nekoosa mart|sp driftgoods|bargain city|snap market|rice street market|broadway mart|ferguson s orchards|hey everything|asap general sto|store eau claire)\b/.test(value)) return "general_merchandise_needs_receipt";
  if (/\b(allpaid city|city of |county main|inefile|paystar)\b/.test(value)) return "government_or_legal_needs_review";
  if (/\b(frontier reservations|rightway parking|parking lightpark|baldwin travel|jcs destin|beach break)\b/.test(value)) return "travel_needs_review";
  if (/\b(carden international|ventureacademy|clarity school)\b/.test(value)) return "education_or_training_needs_review";
  if (/\b(reminspecti|cahillphotostudio|queensboro industries)\b/.test(value)) return "professional_services_needs_review";
  if (/\b(synergy corporate offi)\b/.test(value)) return "cooperative_account_needs_review";
  if (/\b(google cash app pay)\b/.test(value)) return "software_or_advertising_needs_review";
  if (/\b(netflix|prime video|disney|roku|amazon music|hookah|tobacco|vapor land|petco|picapet|pet center|great clips|pharmacy|cvs|walgreens|adventure park|history center|groupon|action city|zero gravity|crystal cave|monster reservations|westgate tc|ice cream|ice creamery|scheels|zumiez|aeropostale|wellness resources|rawtruthnutra|myiq|striker lanes|kossma beauty|clinic for christian coun)\b/.test(value)) return "personal_or_nonbusiness_needs_review";
  return "uncategorized";
}

export function classifyStatementTransaction(
  transaction: StatementTransaction,
  targets: AllocationTarget[],
): { category: string; allocation: AllocationSuggestion | null } {
  const currentCategory = transaction.suggestedCategory?.trim().toLowerCase() ?? "";
  const derivedCategory = categoryForStatementDescription(transaction.description);
  const category = unresolvedCategories.has(currentCategory) && derivedCategory !== "uncategorized"
    ? derivedCategory
    : transaction.suggestedCategory || derivedCategory;
  if (transaction.isTransfer || transaction.direction === "credit") return { category, allocation: null };
  const description = ` ${normalized(transaction.description)} `;
  const matches = targets.flatMap((target) => {
    if (target.type !== "property" && target.type !== "unit") return [];
    const metadata = target.metadata ?? {};
    const city = typeof metadata.locationCity === "string" ? normalized(metadata.locationCity) : "";
    const state = typeof metadata.locationState === "string" ? normalized(metadata.locationState) : "";
    if (!city || !description.includes(` ${city} `)) return [];
    const stateMatched = Boolean(state && description.includes(` ${state} `));
    return [{ target, score: stateMatched ? 0.9 : 0.76, city, state: state || null }];
  });
  if (!matches.length) return { category, allocation: null };
  const highestScore = Math.max(...matches.map((match) => match.score));
  const strongest = matches.filter((match) => match.score === highestScore);
  const propertyMatches = strongest.filter((match) => match.target.type === "property");
  const candidates = propertyMatches.length === 1 ? propertyMatches : strongest;
  if (candidates.length !== 1) return { category, allocation: null };
  const match = candidates[0];
  return {
    category,
    allocation: {
      targetType: match.target.type,
      targetRef: match.target.ref,
      targetLabel: match.target.label,
      amountCents: transaction.amountCents,
      allocationPercent: 100,
      confidence: match.score,
      rationale: match.state
        ? `Merchant description matches ${match.city}, ${match.state}; confirm before posting.`
        : `Merchant description matches ${match.city}; confirm before posting.`,
      metadata: {
        ...(match.target.metadata ?? {}),
        assignmentEvidence: "merchant_location_suggestion",
        matchedMerchantCity: match.city,
        matchedMerchantState: match.state,
      },
    },
  };
}
