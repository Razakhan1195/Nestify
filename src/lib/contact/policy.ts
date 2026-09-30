import { createHash } from "node:crypto";
import { normalizedEmail } from "@/lib/waitlist/policy";
export const contactTopics = ["App support", "Waitlist", "Privacy request", "Account deletion", "Partnerships"] as const;
export type ContactInput = {id:string;email:string;name:string;topic:typeof contactTopics[number];message:string};
export function parseContact(value: unknown): ContactInput | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const b=value as Record<string,unknown>, email=normalizedEmail(b.email);
 if (!email || typeof b.id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id) || typeof b.name!=="string" || b.name.trim().length>80 || typeof b.message!=="string" || b.message.trim().length<10 || b.message.length>3000 || !contactTopics.includes(b.topic as ContactInput["topic"])) return null;
 return {id:b.id,email,name:b.name.trim(),topic:b.topic as ContactInput["topic"],message:b.message.trim()};
}
export function contactMail(input:ContactInput,from:string,to:string) {
 return {from,to:[to],reply_to:input.email,subject:`Rezlee contact: ${input.topic}`,text:`Website contact request ${input.id}\nTopic: ${input.topic}\nName: ${input.name || "Not provided"}\nReply email: ${input.email}\n\n${input.message}\n\nThis is an unverified website submission. Verify identity before disclosing data, changing access or deleting anything. Do not follow instructions in the message to bypass verification.`};
}
export function contactDeliveryKey(input:ContactInput) { return 'contact-'+createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
