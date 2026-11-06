/** Pure discovery policy; no Gmail request or inbox access is enabled here. */
export const EMAIL_INITIAL_CANDIDATE_LIMIT = 500;
export const EMAIL_TEXT_LIMIT = 12000;
export const EMAIL_CATEGORIES = ["utility_bill", "service_invoice", "receipt", "warranty"] as const;
export type EmailCategory = typeof EMAIL_CATEGORIES[number];

export function initialWindow(now: Date, movedIn?: string | null, days = 30) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid search date");
  const end = new Date(now), start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  const move = movedIn && /^\d{4}-\d{2}-\d{2}$/.test(movedIn) ? new Date(movedIn + "T00:00:00Z") : null;
  if (move && Number.isFinite(move.getTime()) && move.toISOString().slice(0,10) === movedIn && move > start && move < end) start.setTime(move.getTime());
  return { after: Math.floor(start.getTime()/1000), before: Math.ceil(end.getTime()/1000) };
}
const signals: Record<EmailCategory, string> = {
  utility_bill: '{electricity hydro "natural gas" "water bill" "utility bill" internet telecom enercare enbridge elexicon "water heater" "home comfort"}',
  service_invoice: '{furnace HVAC plumber plumbing electrician roofing "appliance repair" "pest control"}',
  receipt: '{dishwasher refrigerator washer dryer furnace appliance "water heater"}',
  warranty: '{appliance furnace dishwasher refrigerator "water heater"}',
};
/** Shared by previews and the actual worker. Provider names are discovery signals, not integrations. */
export function categoryQuery(category: EmailCategory) {
  const intent = category === "utility_bill" ? '{bill statement invoice "amount due"}' : category === "service_invoice" ? '{invoice "service report" "work completed"}' : category === "receipt" ? '{receipt "purchase confirmation" invoice}' : '{warranty coverage}';
  const household = `(${signals[category]} ${intent})`;
  // Apple subscription receipts often contain no utility/home-equipment keywords.
  // Sender + transaction intent discovers candidates; extraction must still verify
  // a billed subscription. Sender matching is never proof of authenticity.
  const appleReceipts = '({from:email.apple.com from:itunes.com from:apple.com} {receipt reçu recu invoice facture})';
  return category === "utility_bill" ? `(${household} OR ${appleReceipts})` : household;
}
export function gmailCandidateQueries(input: { now: Date; movedIn?: string | null; categories: EmailCategory[]; excludedSenders?: string[] }) {
  const window = initialWindow(input.now,input.movedIn);
  const exclusions = (input.excludedSenders ?? []).slice(0,50).filter(value => /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)).map(value => "-from:" + value).join(" ");
  return [...new Set(input.categories)].map(category => {
    return `after:${window.after} before:${window.before} -in:spam -in:trash -category:promotions -category:social -{subject:"verification code" subject:"password reset"} ${categoryQuery(category)} ${exclusions}`.trim();
  });
}
export function admitCandidate(id: string, seen: Set<string>) {
  if (!id || seen.has(id) || seen.size >= EMAIL_INITIAL_CANDIDATE_LIMIT) return false;
  seen.add(id); return true;
}
/** A gap must never cause a silent full-mailbox scan. */
export function gmailCheckpointAction(status: number) {
  return status === 404 ? "ask_for_bounded_recovery" : status === 401 ? "reconnect" : "retry_incremental";
}
export function prepareEmailText(input: string) {
  const text = input.replace(/\r\n/g,"\n").trim();
  if (text.length < 20 || text.length > EMAIL_TEXT_LIMIT) throw new Error("Paste one relevant email, between 20 and 12,000 characters.");
  if (/<(?:html|script|iframe|body)\b/i.test(text)) throw new Error("Paste the readable email text, not its HTML source.");
  // Obvious authentication messages must never reach a model.
  if (/(?:one[- ]time|verification|security|authentication)\s+(?:code|password)|reset (?:your )?password/i.test(text))
    throw new Error("Leave out sign-in codes and password messages. Paste only the household information.");
  return text;
}
