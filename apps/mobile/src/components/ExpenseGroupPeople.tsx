import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "expo-router";
import {Alert,Share,Text,View} from "react-native";
import {Button} from "./Button";
import {TextField} from "./TextField";
import {QuietAction} from "./Brief";
import {Surface} from "./ui/Surface";
import {AddExpensePerson,expensePersonStatus} from "./ExpensePeople";
import {PersonPicker,SharedNotice,getSharedStyles} from "./SharedExpenseUI";
import {saveGroupAction,type GroupCommand} from "@/lib/expense-groups";
import type {SharedPayload,SharedPerson} from "@/lib/shared-expenses";
import {ApiError} from "@/lib/api";

function InviteGroupPerson({data,person,reload}:{data:SharedPayload;person:SharedPerson;reload:()=>Promise<unknown>}){
 const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const [open,setOpen]=useState(false),[email,setEmail]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const lock=useRef(false),code=useRef<string|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function action(command:GroupCommand,share=false){
  if(lock.current||!data.groupId)return;lock.current=true;setBusy(true);setError(null);
  try{
   const result=await saveGroupAction({action:"manage",groupId:data.groupId,command},data.viewerId);
   if(!alive.current)return;
   if(result.inviteCode)code.current=result.inviteCode;
   await reload();if(!alive.current)return;
   if(share&&code.current)await Share.share({title:"Join "+data.home.name,message:"Join "+data.home.name+" in Rezlee to keep shared expenses and repayments together. This invitation shares expenses only, not Care, Bills or Vault. Use the email account the invitation was addressed to.\n\nrezlee://shared/join?code="+code.current+"\n\nIf the link does not open: Rezlee → Bills → Expenses → Groups → Join with an invitation. Paste this code: "+code.current});
   setOpen(false);
  }catch(e){setError(e instanceof ApiError?e.message:"Could not complete this step. Check the invitation’s status before trying again.");}
  finally{lock.current=false;setBusy(false);}
 }
 if(data.archived||person.self||person.state==="owner"||person.state==="member")return null;
 return <View style={{gap:12}}>
  {error?<SharedNotice message={error}/>:null}
  {person.state==="invited"?<>
   <Text style={s.label}>{person.inviteExpired?"This invitation expired. Cancel it, then create a fresh one.":"The invitation expires after seven days. Only the verified email account you chose can accept."}</Text>
   {!person.inviteExpired?<Button label="Share invitation" variant="secondary" loading={busy} onPress={()=>void action({operation:"share_invite",personId:person.id},true)}/>:null}
   <QuietAction label="Cancel invitation" onPress={()=>{if(!busy)Alert.alert("Cancel invitation?","They won’t be able to join through this link. Their expenses and balance stay saved.",[{text:"Keep",style:"cancel"},{text:"Cancel invitation",style:"destructive",onPress:()=>void action({operation:"cancel_invite",personId:person.id})}]);}}/>
  </>:open?<Surface tone="subtle" style={{gap:12}}>
   <Text style={s.heading}>Invite {person.name}</Text><Text style={s.body}>They’ll see this group’s existing expense history and keep the same balance when they join. Care, private bills and Vault stay private.</Text>
   {person.state==="former"?<Text style={s.label}>For someone who previously joined, use their original account email. Don’t assign their existing balance to another person.</Text>:null}
   <TextField label="Their Rezlee account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!busy}/>
   <Text style={s.label}>This creates a private link. Choose Share invitation afterward to send it yourself. No message is sent automatically.</Text>
   <Button label="Create invitation link" loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={()=>void action({operation:"invite",personId:person.id,email:email.trim()})}/>
   <QuietAction label="Cancel" onPress={()=>{if(!busy)setOpen(false);}}/>
  </Surface>:<QuietAction label={"Invite "+person.name} onPress={()=>setOpen(true)}/>}
 </View>;
}
export function GroupPeople({data,reload}:{data:SharedPayload;reload:()=>Promise<unknown>}){
 const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const router=useRouter(),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[renaming,setRenaming]=useState(false),[name,setName]=useState(data.home.name),[successor,setSuccessor]=useState("");
 const owner=data.role==="owner",active=data.people.filter(p=>p.state!=="former");
 async function change(command:GroupCommand){
  if(lock.current||!data.groupId)return;lock.current=true;setBusy(true);setError(null);
  try{await saveGroupAction({action:"manage",groupId:data.groupId,command},data.viewerId);if(!alive.current)return;if(command.operation==="leave"){router.replace("/shared/groups");return;}await reload();setRenaming(false);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not confirm this change. Check the previous save from Groups.");}
  finally{lock.current=false;setBusy(false);}
 }
 return <>
  <Text accessibilityRole="header" style={s.heading}>{data.home.name}</Text>
  <Text style={s.body}>Expense-only access. Joined people can see this group’s expenses, repayments, people and balances. Joining never adds them to your household.</Text>
  {error?<SharedNotice message={error}/>:null}
  {data.archived?<SharedNotice message="Archived. History remains available. Restore the group to add expenses or invite people."/>:null}
  <Text style={s.label}>{active.length} of 40 current participants</Text>
  <View>{data.people.map(person=><View key={person.id} style={[s.row,{gap:10}]}>
   <Text style={s.body}>{person.name}{person.self?" (you)":""}</Text><Text style={s.label}>{person.state==="owner"?"Group owner":expensePersonStatus(person)}</Text>
   {owner?<InviteGroupPerson key={person.id+person.state} data={data} person={person} reload={reload}/>:null}
   {owner&&!data.archived&&!person.self&&person.state!=="former"?<QuietAction label={"Remove "+person.name} onPress={()=>{if(!busy)Alert.alert("Remove "+person.name+"?","They lose access to this group. Past expenses and outstanding balances remain, and the group owner can record later repayments. They won’t be selectable for new expenses.",[{text:"Keep",style:"cancel"},{text:"Remove",style:"destructive",onPress:()=>void change({operation:"remove_member",personId:person.id})}]);}}/>:null}
  </View>)}</View>
  {owner&&!data.archived&&active.length<40?<AddExpensePerson expectedUserId={data.viewerId} groupId={data.groupId} homeId={data.home.id} prominent initialOpen={active.length===1} onAdded={async()=>{if(!await reload())throw Error("Refresh failed");}}/>:null}
  {owner?<Surface tone="subtle" style={{gap:16}}>
   <Text style={s.heading}>Manage group</Text>
   {renaming?<><TextField label="Group name" value={name} onChangeText={setName} maxLength={80} editable={!busy}/><Button label="Save group name" loading={busy} disabled={!name.trim()} onPress={()=>void change({operation:"rename",name:name.trim()})}/><QuietAction label="Cancel rename" onPress={()=>setRenaming(false)}/></>:<QuietAction label="Rename group" onPress={()=>{setName(data.home.name);setRenaming(true);}}/>}
   {data.archived?<Button label="Restore group" variant="secondary" loading={busy} onPress={()=>void change({operation:"restore"})}/>:<><Button label="Archive group" variant="secondary" disabled={busy||data.balances.length>0} onPress={()=>Alert.alert("Archive this group?","All balances are settled. History remains available and you can restore the group later.",[{text:"Keep active",style:"cancel"},{text:"Archive",onPress:()=>void change({operation:"archive"})}])}/>{data.balances.length>0?<Text style={s.label}>Settle outstanding balances before archiving.</Text>:null}</>}
   {data.people.some(p=>p.state==="member")?<><PersonPicker label="New group owner" people={data.people.filter(p=>p.state==="member")} value={successor} onChange={setSuccessor} disabled={busy}/><Button label="Transfer ownership" variant="secondary" disabled={!successor||busy} onPress={()=>Alert.alert("Transfer group ownership?","The new owner can manage people, invitations and corrections. You remain a participant and can leave afterward.",[{text:"Cancel",style:"cancel"},{text:"Transfer",onPress:()=>void change({operation:"transfer_owner",personId:successor})}])}/></>:<Text style={s.label}>To leave as owner, first invite someone to join and transfer ownership. If you’re finished with a settled group, archive it.</Text>}
  </Surface>:<Button label="Leave group" variant="secondary" loading={busy} onPress={()=>Alert.alert("Leave this group?","You’ll lose access. Existing expenses and any outstanding balances remain; leaving does not settle or erase a debt. The owner can record later repayments.",[{text:"Stay",style:"cancel"},{text:"Leave",style:"destructive",onPress:()=>void change({operation:"leave"})}])}/>}
  <QuietAction label="All expense groups" onPress={()=>router.push("/shared/groups")}/>
 </>;
}
