import type { NeedsYouSection } from "./needs-you-data";

/** Filter both the visible list and bulk actions to the same explicit scope. */
export function attentionSections(sections: NeedsYouSection[], careOnly: boolean) {
  return careOnly
    ? sections.map(section => ({ ...section, items: section.items.filter(item => item.sourceType === "care") })).filter(section => section.items.length > 0)
    : sections;
}
