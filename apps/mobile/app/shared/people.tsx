import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {GroupPeople} from "@/components/ExpenseGroupPeople";
import {groupParams} from "@/lib/shared-expenses";
import {useRouter} from "expo-router";
import {AddExpensePerson,InviteExpensePerson,expensePersonStatus} from "@/components/ExpensePeople";
import {useRef,useState} from "react";
import {Alert,Text,View} from "react-native";
import {QuietAction} from "@/components/Brief";
import {SharedFrame,SharedLoading,SharedNotice,getSharedStyles,useSharedLedger} from "@/components/SharedExpenseUI";
import {saveSharedExpense} from "@/lib/shared-expenses";
import {ApiError} from "@/lib/api";
export default function SharedPeople(){
 const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const router=useRouter(),{data,error,busy,load}=useSharedLedger(),lock=useRef(false);
 const [failure,setFailure]=useState<string|null>(null),[saving,setSaving]=useState(false);
 async function mutate(id:string){
  if(!data||lock.current)return;lock.current=true;setSaving(true);setFailure(null);
  try{await saveSharedExpense(data.home.id,{operation:"archive_person",id},data.groupId,data.viewerId);await load();}
  catch(e){setFailure(e instanceof ApiError?e.message:"Could not confirm this change. Check your previous save in Shared expenses.");}
  finally{setSaving(false);lock.current=false;}
 }
 if(data?.groupId)return <SharedFrame title="Group people" disabled={saving}>{error?<SharedNotice message={error} onRetry={()=>void load()}/>:null}<GroupPeople key={data.groupId+data.viewerId} data={data} reload={load}/></SharedFrame>;
 return <SharedFrame title="People" disabled={saving}>
  {error?<SharedNotice message={error} onRetry={()=>void load()}/>:null}{failure?<SharedNotice message={failure}/>:null}
  {busy&&!data?<SharedLoading/>:null}
  {data?<>
   <Text style={s.label}>{data.home.name}</Text><Text style={s.heading}>Who shares the costs?</Text>
   <View>{data.people.map(p=><View key={p.id} style={[s.row,{gap:4}]}><Text style={s.body}>{p.name}{p.self?" (you)":""}</Text><Text style={s.label}>{expensePersonStatus(p)}</Text>
    {data.role==="owner"&&p.guest&&p.state==="local"&&!p.memberId?<QuietAction label={"Remove "+p.name} onPress={()=>{if(!saving&&!error)Alert.alert("Remove "+p.name+"?","Past expenses and any outstanding balance remain. They won’t appear in new expense selections.",[{text:"Keep",style:"cancel"},{text:"Remove",style:"destructive",onPress:()=>void mutate(p.id)}]);}}/>:null}
    {data.role==="owner"?<InviteExpensePerson person={p} onChange={load}/>:null}
   </View>)}</View>
   {data.role==="owner"?<AddExpensePerson expectedUserId={data.viewerId} groupId={data.groupId} homeId={data.home.id} prominent initialOpen={!data.people.some(person=>!person.self&&person.state!=="former")} onAdded={async()=>{if(!await load())throw Error("Refresh failed");}}/>:null}
   <QuietAction label="Manage household access" onPress={()=>router.push("/household")}/>
   <Text style={s.label}>Adding a name tracks their share without giving access. Invite them here to connect their account to the same expenses and balance after they accept.</Text>
  </>:null}
 </SharedFrame>;
}
