import pathlib
r=pathlib.Path('/Users/razakhan/Documents/rezlee-mobile-test')
p=r/'apps/mobile/src/lib/shared-expense-types.ts';s=p.read_text();s=s.replace('export type SharedPayload={','export type SharedPayload={groupId?:string;archived?:boolean;');p.write_text(s)
p=r/'apps/mobile/src/lib/shared-expenses.ts';s=p.read_text();s=s.replace('PendingSharedSave={homeId:string;','PendingSharedSave={homeId:string;groupId?:string;')
start=s.index('export function fetchSharedExpenses(');end=s.index('async function storageKey()',start)
s=s[:start]+'''export function fetchSharedExpenses(options?:{id?:string;before?:string;groupId?:string;expectedUserId?:string}){
 const params=new URLSearchParams();
 for(const field of ["id","before","groupId"] as const)if(options?.[field])params.set(field,options[field]!);
 const query=params.toString();
 return apiGet<SharedPayload>((options?.groupId?"/api/mobile/v1/expense-groups":"/api/mobile/v1/shared-expenses")+(query?"?"+query:""),{timeoutMs:15000,expectedUserId:options?.expectedUserId});
}
export const groupParams=(data:Pick<SharedPayload,"groupId">|null|undefined,extra:Record<string,string>={})=>({...extra,...(data?.groupId?{groupId:data.groupId}:{})});
'''+s[end:]
s=s.replace('saveSharedExpense(homeId:string,command:SharedCommand)','saveSharedExpense(homeId:string,command:SharedCommand,groupId?:string)')
s=s.replace('pending.homeId!==homeId||JSON.stringify','pending.homeId!==homeId||pending.groupId!==groupId||JSON.stringify')
s=s.replace('const intent=pending??{homeId,command,requestId:randomUUID()};','const intent=pending??{homeId,command,requestId:randomUUID(),...(groupId?{groupId}:{})};')
a='const result=await apiPost<SharedSaveResult>("/api/mobile/v1/shared-expenses",intent,{timeoutMs:20000});'
b='const result=await apiPost<SharedSaveResult>(groupId?"/api/mobile/v1/expense-groups":"/api/mobile/v1/shared-expenses",groupId?{action:"ledger",groupId,requestId:intent.requestId,command:intent.command}:intent,{timeoutMs:20000,expectedUserId:key.slice("shared-expense-save-".length)});'
assert a in s;s=s.replace(a,b);p.write_text(s)
p=r/'apps/mobile/src/components/SharedExpenseUI.tsx';s=p.read_text().replace('import { useFocusEffect }','import { useAuth } from "@/auth/AuthProvider";\nimport { useFocusEffect,useLocalSearchParams }')
start=s.index('export function useSharedLedger(');end=s.index('/** Reusable',start)
s=s[:start]+'''export function useSharedLedger(id?:string){
 const {groupId:rawGroupId}=useLocalSearchParams<{groupId?:string}>();
 const groupId=typeof rawGroupId==="string"?rawGroupId:undefined;
 const {session}=useAuth(),userId=session?.user.id;
 const [data,setData]=useState<SharedPayload|null>(null),[dataUser,setDataUser]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(true);
 const version=useRef(0),account=useRef(userId);account.current=userId;
 const load=useCallback(async()=>{
  const run=++version.current;setBusy(true);
  try{
   if(!userId)throw new ApiError("Sign in to view shared expenses.",401);
   const result=await fetchSharedExpenses({id,groupId,expectedUserId:userId});
   if(run!==version.current||account.current!==userId)return null;
   setData(result);setDataUser(userId);setError(null);return result;
  }catch(e){if(run===version.current&&account.current===userId){if(e instanceof ApiError&&[401,403,404,409].includes(e.status))setData(null);setError(e instanceof ApiError?e.message:"Could not load shared expenses. Check your connection.");}return null;}
  finally{if(run===version.current)setBusy(false);}
 },[id,groupId,userId]);
 useFocusEffect(useCallback(()=>{void load();return()=>{version.current++;};},[load]));
 const current=dataUser===userId&&data?.groupId===groupId?data:null;
 return {data:current,setData,error,busy,load,groupId};
}

'''+s[end:];p.write_text(s)
# Preserve group scope through all existing ledger actions and navigation.
for name in ['index.tsx','edit.tsx','repay.tsx','[id].tsx','people.tsx']:
 p=r/'apps/mobile/app/shared'/name;s=p.read_text()
 # Add independently to avoid changing existing named imports.
 s='import {groupParams} from "@/lib/shared-expenses";\n'+s
 s=s.replace('saveSharedExpense(pending.homeId,pending.command)','saveSharedExpense(pending.homeId,pending.command,pending.groupId)')
 s=s.replace('saveSharedExpense(data.home.id,command)','saveSharedExpense(data.home.id,command,data.groupId)')
 s=s.replace('saveSharedExpense(data.home.id,{operation:"archive_person",id})','saveSharedExpense(data.home.id,{operation:"archive_person",id},data.groupId)')
 s=s.replace('saveSharedExpense(data.home.id,{operation:"void",id:entry.id,version:entry.version,reason:reason.trim()})','saveSharedExpense(data.home.id,{operation:"void",id:entry.id,version:entry.version,reason:reason.trim()},data.groupId)')
 s=s.replace('fetchSharedExpenses({before:data.nextCursor})','fetchSharedExpenses({before:data.nextCursor,groupId:data.groupId})')
 for path in ['/shared/people','/shared/edit','/shared']:
  s=s.replace('router.push("'+path+'")','router.push({pathname:"'+path+'",params:groupParams(data)})')
  s=s.replace('router.replace("'+path+'")','router.replace({pathname:"'+path+'",params:groupParams(data)})')
 for a,b in [('params:{from:pair.from,to:pair.to}','params:groupParams(data,{from:pair.from,to:pair.to})'),('params:{id:entry.id}','params:groupParams(data,{id:entry.id})'),('params:{id:saved,saved:"1"}','params:groupParams(data,{id:saved,saved:"1"})'),('params:{id:saved,...(existing?{existing:"1"}:{saved:"1"})}','params:groupParams(data,{id:saved,...(existing?{existing:"1"}:{saved:"1"})})')]:s=s.replace(a,b)
 s=s.replace('<AddExpensePerson homeId={data.home.id}','<AddExpensePerson groupId={data.groupId} homeId={data.home.id}')
 s=s.replace('const ready=Boolean(data&&!error','const ready=Boolean(data&&!data.archived&&!error')
 s=s.replace('!unavailable&&selected.every','!unavailable&&!data.archived&&selected.every')
 s=s.replace('const valid=Boolean(pair&&cents','const valid=Boolean(!data.archived&&pair&&cents')
 s=s.replace('Your household balances are updated.','Your shared balances are updated.')
 s=s.replace('Visible to joined household members. Records a payment already made; no money moves.','Visible to people who have joined this expense group or household. Records a payment already made; no money moves.')
 p.write_text(s)
p=r/'apps/mobile/src/components/ExpensePeople.tsx';s=p.read_text();s=s.replace('AddExpensePerson({homeId,onAdded,','AddExpensePerson({homeId,groupId,onAdded,').replace('{homeId:string;onAdded:','{homeId:string;groupId?:string;onAdded:').replace('saveSharedExpense(homeId,{operation:"add_person",name:name.trim()})','saveSharedExpense(homeId,{operation:"add_person",name:name.trim()},groupId)');p.write_text(s)
print('Scoped ledger client/forms; household API unchanged')
