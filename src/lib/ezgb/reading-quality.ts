/** Provider quality labels are evidence; forecasts must not establish observed usage changes. */
export function isUnreliableReadingQuality(value: string | null | undefined) {
  return /estimated|mixed|projected|forecast|substitut|interpolat|invalid|suspect|not[ -]actual/i.test(value ?? "");
}
