export const AI_SHARING_VERSION = "2026-10-13";
export const AI_SHARING_TITLE = "Choose how Rezlee uses AI";
export const AI_SHARING_DESCRIPTION = "When you ask for AI help, Rezlee sends your question, selected files or email content, and relevant saved household details to Google or OpenAI. Vercel may route these requests. These services process the information to read documents and provide answers or suggestions. Fresh uploads and descriptions may go directly to OpenAI, which may keep safety logs for up to 30 days (longer if legally required). We do not opt your content into model training. Gmail data and saved household context use protected routing.";
export const AI_SHARING_CONTROL = "AI is optional. You can keep adding and reviewing records manually. Change this choice in Settings → AI privacy. Gmail connection permission is separate.";
export function requestUsesAi(path:string,body?:unknown){
 const p=path.split("?")[0],b=body&&typeof body==="object"?body as Record<string,unknown>:{};
 if(["/api/mobile/v1/assistant","/api/mobile/v1/warranty-claims","/api/mobile/v1/ai/scan","/api/mobile/v1/repairs/photo"].includes(p))return true;
 if(/^\/api\/mobile\/v1\/bills\/[^/]+\/(?:evidence|offers)\/read$/.test(p))return true;
 if(p==="/api/mobile/v1/care/plan")return b.action!=="save";
 if(p==="/api/mobile/v1/quotes")return b.action==="read";
 if(p==="/api/mobile/v1/repairs"){const c=b.change as Record<string,unknown>|undefined;return b.operation==="create"||b.operation==="change"&&["respond","tailor"].includes(String(c?.action));}
 if(p==="/api/mobile/v1/email-memory")return b.consent===true&&typeof b.text==="string";
 if(p==="/api/mobile/v1/gmail-memory")return ["connect","confirm","resume","new","older"].includes(String(b.action))||b.action==="preferences"&&b.ongoing===true;
 return false;
}
type Dependencies={currentUser:()=>Promise<string|null>;read:()=>Promise<boolean>;prompt:()=>Promise<boolean>;save:()=>Promise<void>};
export async function obtainAiPermission(userId:string,d:Dependencies){
 const same=async()=>{if(await d.currentUser()!==userId)throw Error("Your account changed. Reopen this screen to continue.");};
 await same();if(await d.read()){await same();return;}
 await same();if(!await d.prompt())throw Error("Nothing was sent for AI processing. You can use manual tools or try again when you are ready.");
 await same();await d.save();await same();
}
