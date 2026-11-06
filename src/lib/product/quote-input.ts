import {z} from "zod";
import {quoteQuestionText} from "../../../apps/mobile/src/lib/quote-review";
const text=z.string().trim().max(1500);
export const quoteDraftSchema=z.object({
 fields:z.object({supplier:text,scope:text,partsLabour:text,price:text,taxes:text,exclusions:text,schedule:text,payment:text,warranty:text}).strict(),
 answers:z.record(z.string(),z.string().trim().max(1200)).refine(v=>Object.keys(v).every(k=>k in quoteQuestionText)&&Object.keys(v).length<=9,"Choose a supported question."),
 decision:z.enum(["considering","questions","proceed","declined"]),decisionNote:z.string().trim().max(2000),
 context:z.enum(["owner","tenant"]),reviewed:z.boolean(),
 itemId:z.string().uuid().nullable(),issueId:z.string().uuid().nullable(),invoiceId:z.string().uuid().nullable(),
}).strict().refine(v=>v.decision!=="proceed"||v.reviewed,"Review the details before recording a decision to proceed.");
export const quoteMutationSchema=z.object({
 documentId:z.string().uuid(),homeId:z.string().uuid(),sourceVersion:z.string().datetime({offset:true}),
 version:z.number().int().nonnegative(),requestId:z.string().uuid(),action:z.enum(["save","read","cancel"]),
 payload:quoteDraftSchema.optional(),consent:z.boolean().optional(),
}).strict().refine(v=>v.action!=="save"||!!v.payload,"Review the quote before saving.")
 .refine(v=>v.action!=="read"||v.consent===true,"Confirm before sending the quote for reading.");
