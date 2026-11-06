import { z } from "zod";
export const vaultCategories=["Receipt","Warranty","Insurance","Manual","Lease","Contract","Tax","Other"] as const;
export const vaultDate=z.string().refine(v=>!v || (/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),"Choose a valid date.");
export const vaultRecordInput=z.object({
 id:z.string().uuid().optional(),title:z.string().trim().min(1,"Enter a record title.").max(200),
 category:z.enum(vaultCategories),issued_on:vaultDate,expires_on:vaultDate,notes:z.string().trim().max(5000),
}).refine(v=>!v.issued_on||!v.expires_on||v.expires_on>=v.issued_on,{message:"Expiry must be on or after the issue date.",path:["expires_on"]});
