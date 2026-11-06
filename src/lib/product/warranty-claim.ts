import { z } from "zod";

export const warrantyClaimInput = z.object({
  requestId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(2).refine(ids => new Set(ids).size === ids.length, "Choose each record once."),
  itemName: z.string().trim().min(1, "Enter the item name.").max(200),
  issue: z.string().trim().min(10, "Describe what happened.").max(2000),
  recordsConfirmed: z.literal(true),
}).strict();
export type ClaimInput = z.infer<typeof warrantyClaimInput>;
export const claimEvidenceSchema = z.object({
  facts: z.array(z.object({
    sourceId: z.string().uuid(),
    kind: z.enum(["product", "purchase", "coverage", "exclusion", "deadline", "contact"]),
    excerpt: z.string().trim().min(1).max(700),
    page: z.number().int().min(1).max(500).nullable(),
  }).strict()).max(12),
  relationship: z.enum(["consistent", "unclear", "conflicting"]),
}).strict();
export type ClaimEvidence = z.infer<typeof claimEvidenceSchema>;
export type ClaimSource = {
  id: string; title: string; updated_at: string; notes: string | null;
  expires_on: string | null; hasFile: boolean;
};
export function checkedClaimEvidence(raw: unknown, sources: ClaimSource[]): ClaimEvidence {
  const evidence = claimEvidenceSchema.parse(raw);
  for (const fact of evidence.facts) {
    const source = sources.find(s => s.id === fact.sourceId);
    if (!source) throw Error("Unknown evidence source");
    if (!source.hasFile && (!source.notes?.includes(fact.excerpt) || fact.page !== null)) {
      throw Error("Unsupported source passage");
    }
  }
  return evidence;
}
export { manualWarrantyDraft } from "../../../apps/mobile/src/lib/warranty-claim";
export function claimWarnings(evidence: ClaimEvidence, sources: ClaimSource[], today: string) {
  const warnings = ["Recorded dates and extracted wording do not establish that a claim is covered. Check the originals and confirm with the warranty provider."];
  if (evidence.relationship !== "consistent") warnings.push(evidence.relationship === "conflicting"
    ? "These records may describe different products or conflicting terms. Resolve the differences before using the draft."
    : "It is unclear whether these records apply to the same product. Check the model and proof of purchase.");
  if (!evidence.facts.some(f => f.kind === "coverage")) warnings.push("No coverage wording was identified. Ask the provider for the applicable warranty terms.");
  if (!evidence.facts.some(f => f.kind === "purchase")) warnings.push("Proof of purchase was not identified. A saved receipt title alone does not prove payment.");
  if (!evidence.facts.some(f => f.kind === "deadline")) warnings.push("No explicit claim deadline was identified. Ask the provider rather than assuming there is no deadline.");
  if (sources.some(s => s.expires_on && s.expires_on < today)) warnings.push("A saved expiry date has passed. It may be incomplete or refer to another kind of deadline; confirm the applicable terms.");
  return warnings;
}
