import {z} from "zod";
const short=z.string().trim().max(200),note=z.string().trim().max(2000);
const amount=z.string().trim().refine(v=>v===""||/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(v),"Enter an amount such as 125.50, without a currency symbol.");
export const purchaseDraftSchema=z.object({
 kind:z.enum(["compare","compatibility","replace"]),title:short.min(1,"Give this decision a name."),context:z.enum(["owner","tenant"]),currency:z.enum(["CAD","USD"]),
 notes:note,outcome:note,quotes:z.array(z.object({documentId:z.string().uuid(),sourceVersion:z.string().datetime({offset:true}),reviewRevision:z.number().int().positive(),total:amount,allIn:z.boolean(),scopeConfirmed:z.boolean()}).strict()).max(3),
 chosenQuoteId:z.string().uuid().nullable(),existingModel:short,candidateModel:short,
 checks:z.array(z.object({requirement:short,reference:z.string().trim().max(500),excerpt:note,result:z.enum(["unknown","matches","mismatch"])}).strict()).min(1).max(12),
 repairCost:amount,replacementCost:amount,installationCost:amount,disposalCost:amount,costsComplete:z.boolean(),condition:note,warranty:note,permission:note,
}).strict().refine(d=>new Set(d.quotes.map(q=>q.documentId)).size===d.quotes.length,"Choose each quote only once.")
.refine(d=>!d.chosenQuoteId||d.quotes.some(q=>q.documentId===d.chosenQuoteId),"The shortlist must refer to a selected quote.");
export const purchaseMutationSchema=z.object({id:z.string().uuid(),homeId:z.string().uuid(),version:z.number().int().nonnegative(),requestId:z.string().uuid(),payload:purchaseDraftSchema}).strict();
