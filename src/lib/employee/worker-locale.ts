export type WorkerLocale = "en" | "es";

export function workerLocale(value: unknown): WorkerLocale {
  return value === "es" ? "es" : "en";
}

export function withWorkerLocale(path: string, locale: WorkerLocale) {
  const url = new URL(path, "https://ferocity.local");
  if (locale === "es") url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function formatWorkerDateTime(value: string | Date, locale: WorkerLocale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function workerPlural(
  count: number,
  locale: WorkerLocale,
  forms: { en: [string, string]; es: [string, string] }
) {
  const index = new Intl.PluralRules(locale === "es" ? "es-US" : "en-US").select(count) === "one" ? 0 : 1;
  return forms[locale][index];
}
