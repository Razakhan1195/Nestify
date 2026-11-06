import type { Evidence } from "./repair-evidence";
export type EvidencePassage = { sourceId: string; passageId: string; quote: string };
/** Deterministic snippets retain source text exactly; the model selects an ID. */
export function repairEvidencePassages(evidence: Evidence[]): EvidencePassage[] {
  return evidence.flatMap(source => {
    const snippets: string[] = [];
    const sentences = source.text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [source.text];
    for (const sentence of sentences) {
      let rest = sentence.trim();
      while (rest.length > 450) {
        const space = rest.lastIndexOf(" ", 450);
        const end = space > 20 ? space : 450;
        snippets.push(rest.slice(0, end)); rest = rest.slice(end).trim();
      }
      if (rest.length >= 20) snippets.push(rest);
    }
    return snippets.slice(0, 72).map((quote, i) => ({ sourceId: source.id, passageId: source.id + ":" + i, quote }));
  });
}
export function resolveRepairCitations(refs: {sourceId: string; passageId: string}[], passages: EvidencePassage[]) {
  return refs.map(ref => {
    const passage = passages.find(p => p.sourceId === ref.sourceId && p.passageId === ref.passageId);
    if (!passage) throw Error("Unsupported citation");
    return {sourceId: passage.sourceId, quote: passage.quote};
  });
}
