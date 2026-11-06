import { useRouter } from "expo-router";
import {useRef,useState} from "react";
import {Alert,Text,View} from "react-native";
import {Button} from "./Button";
import {TextField} from "./TextField";
import {QuietAction} from "./Brief";
import {SharedNotice,sharedStyles as s} from "./SharedExpenseUI";
import {addHouseholdPerson,removeHouseholdPerson} from "@/lib/household-data";
import {saveSharedExpense,type SharedPerson} from "@/lib/shared-expenses";
import {ApiError} from "@/lib/api";
import {colors,radii} from "@/theme/tokens";

export function expensePersonStatus(p:SharedPerson){
 return p.state==="former"?"No longer participating":p.state==="invited"?(p.inviteExpired?"Invitation expired":"Invitation pending"):p.state==="local"?"Not joined":"Joined";
}
export function InviteExpensePerson({person,onChange,initialOpen=false}:{person:SharedPerson;onChange:()=>Promise<unknown>;initialOpen?:boolean}){
 const router = useRouter();
 const [open,setOpen]=useState(initialOpen),[email,setEmail]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const lock=useRef(false);
 async function send(){
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{await addHouseholdPerson({displayName:person.name,email:email.trim(),expensePersonId:person.id});setOpen(false);setEmail("");await onChange();}
  catch(e){setError(e instanceof ApiError?e.message:"Could not confirm the invitation. Check its status before trying again.");await onChange();}
  finally{setBusy(false);lock.current=false;}
 }
 async function cancel(){
  if(lock.current||!person.memberId)return;lock.current=true;setBusy(true);setError(null);
  try{await removeHouseholdPerson(person.memberId);await onChange();}
  catch(e){setError(e instanceof ApiError?e.message:"Could not cancel the invitation. Try again.");}
  finally{setBusy(false);lock.current=false;}
 }
 if(!person.guest||person.state==="former"||person.state==="member"||person.state==="owner")return null;
 return <View style={{gap:10}}>
  {error?<SharedNotice message={error}/>:null}
  {person.state==="invited"?<>
   <Text style={s.label}>{person.inviteExpired?"The invitation expired. Cancel it to send a fresh one. Their expenses and balance stay saved.":"They can join after completing the invitation. Their existing expenses and balance stay together."}</Text>
   <QuietAction label={busy?"Updating…":"Cancel invitation"} onPress={()=>{if(!busy)Alert.alert("Cancel invitation?","This stops them joining through this invitation. Their recorded expenses stay saved.",[{text:"Keep invitation",style:"cancel"},{text:"Cancel invitation",style:"destructive",onPress:()=>void cancel()}]);}}/>
  </>:open?<View style={{gap:12,padding:16,borderRadius:radii.lg,backgroundColor:colors.surfaceSubtle}}>
   <Text style={s.heading}>Invite {person.name}</Text>
   <Text style={s.body}>Manage shared costs together. They’ll keep the same expense history and balance when they accept.</Text>
   <QuietAction label="Invite by phone instead" onPress={() => router.push({ pathname: "/household/invite-phone", params: { name: person.name, personId: person.id } })} />
   <TextField label="Their email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} maxLength={254} editable={!busy}/>
   <Text style={s.label}>Joining gives access to this household’s shared expenses and Care, including existing shared history. Private bills and Vault documents stay private. Nothing is sent until you choose Send invitation.</Text>
   <Button label="Send invitation" loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={()=>void send()}/>
   <QuietAction label="Not now" onPress={()=>{if(!busy){setOpen(false);setError(null);}}}/>
  </View>:<QuietAction label={"Invite "+person.name+" to join"} onPress={()=>setOpen(true)}/>}
 </View>;
}
export function AddExpensePerson({homeId,groupId,expectedUserId,onAdded,prominent=false,initialOpen=false}:{homeId:string;groupId?:string;expectedUserId?:string;onAdded:(id:string)=>Promise<unknown>;prominent?:boolean;initialOpen?:boolean}){
 const [open,setOpen]=useState(initialOpen),[name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const lock=useRef(false);
 const [confirmedId,setConfirmedId]=useState<string|null>(null);
 async function add(){
  if(lock.current||!name.trim())return;lock.current=true;setBusy(true);setError(null);
  let savedPersonId=confirmedId;
  try{if(!savedPersonId){const result=await saveSharedExpense(homeId,{operation:"add_person",name:name.trim()},groupId,expectedUserId);if(!result.id)throw Error("Missing person");savedPersonId=result.id;setConfirmedId(result.id);}await onAdded(savedPersonId);setConfirmedId(null);setName("");setOpen(false);}
  catch(e){setError(savedPersonId?"This person was added. Refresh the people list to include them in your expense.":e instanceof ApiError?e.message:"Could not confirm this person was added. Try again with the same name to check the save.");}
  finally{setBusy(false);lock.current=false;}
 }
 return <View style={{gap:12}}>
  {error?<SharedNotice message={error}/>:null}
  {open?<View style={{gap:12,padding:16,backgroundColor:colors.surfaceSubtle,borderRadius:radii.lg}}>
   <Text style={s.body}>Include someone in the split</Text>
   <TextField label="Person’s name" value={name} onChangeText={setName} maxLength={80} placeholder="Alex" editable={!busy&&!confirmedId}/>
   <Text style={s.label}>No account needed. This adds a name to the expense list only. You can invite them after saving.</Text>
   <Button label={confirmedId?"Refresh people":"Add person"} disabled={!name.trim()} loading={busy} onPress={()=>void add()}/>
   <QuietAction label="Cancel" onPress={()=>{if(!busy)setOpen(false);}}/>
  </View>:prominent?<Button label="Add someone to share with" onPress={()=>setOpen(true)}/>:<QuietAction label="Add someone" onPress={()=>setOpen(true)}/>}
 </View>;
}
