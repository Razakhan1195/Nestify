export type GmailAttempt={id:string;userId:string;at:number};
export function verifiedGmailCallback(url:string,attempt:GmailAttempt|null,userId:string|undefined,now=Date.now()){
 const parsed=new URL(url),id=parsed.searchParams.get("id"),proof=parsed.searchParams.get("proof");
 if(parsed.protocol!=="rezlee:"||parsed.hostname!=="gmail-return"||parsed.pathname&&parsed.pathname!=="/"||parsed.searchParams.get("status")!=="confirm"||!attempt||attempt.id!==id||attempt.userId!==userId||now-attempt.at>600000||now<attempt.at||!proof||!/^[A-Za-z0-9_-]{40,100}$/.test(proof))throw Error("Gmail connection wasn’t completed. Please start again.");
 return {id,proof};
}
