type Storage={getItemAsync(k:string):Promise<string|null>;setItemAsync(k:string,v:string):Promise<void>;deleteItemAsync(k:string):Promise<void>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createVaultPendingStore(storage:Storage){
 const queues=new Map<string,Promise<unknown>>();
 function serial<T>(id:string,fn:(key:string)=>Promise<T>){
  if(!uuid.test(id))throw Error("Invalid account");
  const key="rezlee.vault-pending.v1."+id;
  const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(()=>fn(key));
  queues.set(key,next);void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});
  return next;
 }
 return {
  read:(id:string)=>serial(id,async k=>{const v=await storage.getItemAsync(k);if(v&&!uuid.test(v))throw Error("Saved reference is unreadable");return v;}),
  remember:(id:string,request:string)=>serial(id,async k=>{
   if(!uuid.test(request))throw Error("Invalid save");
   const old=await storage.getItemAsync(k);
   if(old&&old!==request)throw Error("Finish the previous Vault save first.");
   await storage.setItemAsync(k,request);
  }),
  forget:(id:string,request:string)=>serial(id,async k=>{if(await storage.getItemAsync(k)===request)await storage.deleteItemAsync(k);}),
  replace:(id:string,expected:string,next:string)=>serial(id,async k=>{
   if(!uuid.test(next)||await storage.getItemAsync(k)!==expected)throw Error("Save reference changed");
   await storage.setItemAsync(k,next);
  }),
  clear:(id:string)=>serial(id,k=>storage.deleteItemAsync(k)),
 };
}
