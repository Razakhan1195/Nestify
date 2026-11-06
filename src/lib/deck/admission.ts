/** Server admission for Deck. Catalogue presence is not launch acceptance. */
export type DeckRegistryAdmission = {id:string;status?:unknown;website_url?:unknown;deck_source_id?:unknown;deck_task_id?:unknown;deck_agent_id?:unknown;metadata?:unknown};
export type DeckLaunchProvider = {registryId:string;websiteUrl:string;sourceId:string;taskId:string;agentId:string|null};
export type DeckAdmissionPolicy = {testing:boolean;providers:DeckLaunchProvider[]};
export const deckUnavailableMessage="This provider connection is not available yet. Your saved bills are still accessible; you can upload a statement instead.";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function portal(value:unknown):string|null {
 if(typeof value!=="string")return null;
 try {const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return null;return u.href;}catch{return null;}
}
export function deckAdmissionPolicy(env:Record<string,string|undefined>=process.env):DeckAdmissionPolicy {
 // Explicit test switch is effective only on the isolated staging database.
 const testing=env.REZLEE_DECK_TESTING_ENABLED==="true"&&env.VERCEL_ENV!=="production"&&env.NEXT_PUBLIC_SUPABASE_URL==="https://gjwvalpxnfbvryosmcbj.supabase.co";
 try{
  const values:unknown=JSON.parse(env.REZLEE_DECK_LAUNCH_PROVIDERS??"[]");
  if(!Array.isArray(values)||values.length>100)throw Error();
  const ids=new Set<string>();
  const providers=values.map((v):DeckLaunchProvider=>{
   if(!v||typeof v!=="object"||typeof v.registryId!=="string"||!uuid.test(v.registryId)||!portal(v.websiteUrl)||typeof v.sourceId!=="string"||!/^src_[a-zA-Z0-9_-]{4,}$/.test(v.sourceId)||typeof v.taskId!=="string"||!/^task_[a-zA-Z0-9_-]{4,}$/.test(v.taskId)||!(v.agentId===null||typeof v.agentId==="string"&&/^agt_[a-zA-Z0-9_-]{4,}$/.test(v.agentId))||ids.has(v.registryId))throw Error();
   ids.add(v.registryId);return {registryId:v.registryId,websiteUrl:portal(v.websiteUrl)!,sourceId:v.sourceId,taskId:v.taskId,agentId:v.agentId};
  });
  return {testing,providers};
 }catch{return {testing,providers:[]};}
}
export function deckAdmission(registry:DeckRegistryAdmission|null,policy=deckAdmissionPolicy()){
 const metadata=registry?.metadata && typeof registry.metadata==="object"?registry.metadata as Record<string,unknown>:{};
 if(metadata.deck_document_alternative===true)return {allowed:false,testing:policy.testing};
 if(policy.testing)return {allowed:registry?.status!=="unsupported",testing:true};
 const approved=registry&&policy.providers.find(p=>p.registryId===registry.id);
 return {allowed:Boolean(approved&&registry?.status==="active"&&portal(registry.website_url)===approved.websiteUrl&&registry.deck_source_id===approved.sourceId&&registry.deck_task_id===approved.taskId&&(registry.deck_agent_id??null)===approved.agentId),testing:false};
}
export function requireDeckAdmission(registry:DeckRegistryAdmission|null,policy=deckAdmissionPolicy()){
 if(!deckAdmission(registry,policy).allowed)throw Error(deckUnavailableMessage);
}

export function requireLegacyDeckAdmission() {
  const localMock = process.env.DECK_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";
  if (!deckAdmissionPolicy().testing && !localMock) throw new Error(deckUnavailableMessage);
}
