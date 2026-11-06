/** Conservative cost filter. Unknown providers and ambiguous messages still reach extraction.
 * This classifies relevance only; it never extracts financial facts or follows links. */
export function shouldReadHouseholdEmail(input:{subject:string;text:string;hasAttachment:boolean}) {
 if(input.hasAttachment)return true;
 const subject=input.subject.trim(),text=input.text;
 const promotional=/\b(newsletter|weekly digest|special offer|limited.time offer|exclusive offer|sale ends|save up to|shop (?:now|the sale)|refer a friend|you could win)\b/i.test(subject);
 if(!promotional)return true;
 // Preserve actual transactions even when senders append marketing copy.
 const transaction=/\b(amount due|total due|payment due|current charges|billing period|invoice (?:number|no\.?|#)|order (?:number|no\.?|#)|receipt (?:number|no\.?|#)|service (?:completed|report)|warranty (?:expires|valid until))\b/i.test(text);
 return transaction;
}
