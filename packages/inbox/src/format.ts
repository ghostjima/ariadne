/*
  Dates, money and case numbers as a complaint or a case sheet writes
  them. Written by hand rather than with Intl, so the same seed gives the
  same bytes on every runtime: Intl's output follows the ICU data a runtime
  ships with.
*/

export const LANGS = ["ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

const MONTHS: Record<Lang, readonly string[]> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/* An ISO day in words: "4 сентября 2026 года", "4 September 2026" */
export function dayText(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  const name = MONTHS[lang][month - 1] ?? "";
  return lang === "ru" ? `${day} ${name} ${year} года` : `${day} ${name} ${year}`;
}

/* Whole roubles with grouped thousands: "48 500", "48,500" */
function grouped(roubles: number, separator: string): string {
  return String(Math.round(roubles)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/* An amount in roubles: "48 500 ₽", "RUB 48,500" */
export function moneyText(roubles: number, lang: Lang): string {
  return lang === "ru" ? `${grouped(roubles, " ")} ₽` : `RUB ${grouped(roubles, ",")}`;
}

/* The same amount from whole kopecks */
export function kopecksText(kopecks: number, lang: Lang): string {
  return moneyText(kopecks / 100, lang);
}
