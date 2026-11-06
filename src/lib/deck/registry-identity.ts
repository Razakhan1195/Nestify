/** Registry IDs are generated separately in each database. Deployment mappings preserve stored IDs. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function registryIdentityMap(env: Record<string,string|undefined> = process.env) {
 try {
  const raw:unknown=JSON.parse(env.REZLEE_PROVIDER_REGISTRY_IDENTITIES??"{}");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return new Map<string,string>();
  const entries=Object.entries(raw);
  if(entries.length>100||entries.some(([canonical,deployed])=>!uuid.test(canonical)||typeof deployed!=="string"||!uuid.test(deployed)))return new Map<string,string>();
  const pairs=entries as [string,string][];
  if(new Set(pairs.map(([,id])=>id.toLowerCase())).size!==pairs.length)return new Map<string,string>();
  // A canonical ID may never be redirected to another canonical provider.
  const canonicals=new Set(pairs.map(([id])=>id.toLowerCase()));
  if(pairs.some(([id,deployed])=>id.toLowerCase()!==deployed.toLowerCase()&&canonicals.has(deployed.toLowerCase())))return new Map<string,string>();
  return new Map(pairs.map(([canonical,deployed])=>[deployed.toLowerCase(),canonical.toLowerCase()]));
 }catch{return new Map<string,string>();}
}
export function canonicalRegistryId(id:string,env:Record<string,string|undefined>=process.env){
 return registryIdentityMap(env).get(id.toLowerCase())??id;
}
