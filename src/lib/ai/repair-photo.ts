export type RepairPhoto = { observation: string; equipment: string; uncertainty: string; possibleHazard: boolean };

/** Repair summaries do not need identifiers copied from equipment labels. */
export function omitRepairSerials(photo: RepairPhoto): RepairPhoto {
  const fields = ["observation", "equipment", "uncertainty"] as const;
  const serials = new Set<string>();
  const labelledSerial = /\b(?:serial(?:\s+(?:number|no\.?|text(?:\s+visible)?))?|s\/n)\s*(?::|#|=|\bis\b)?\s*([a-z0-9](?:[a-z0-9._/-]{1,78}[a-z0-9]))\b/gi;
  for (const field of fields) {
    for (const match of photo[field].matchAll(labelledSerial)) {
      // Avoid interpreting ordinary prose such as "serial number unreadable" as an identifier.
      if (/\d/.test(match[1])) serials.add(match[1]);
    }
  }
  const result = { ...photo };
  for (const field of fields) {
    for (const serial of serials) {
      result[field] = result[field].replaceAll(serial, "[omitted]");
    }
  }
  return result;
}
