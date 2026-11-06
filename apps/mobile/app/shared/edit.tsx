import {groupParams} from "@/lib/shared-expenses";
import {Feather} from "@expo/vector-icons";
import {useFocusEffect,useLocalSearchParams,useNavigation,useRouter} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import {useCallback,useEffect,useRef,useState} from "react";
import {Alert,Pressable,Text,View} from "react-native";
import {Button} from "@/components/Button";
import {DateField} from "@/components/DateField";
import {TextField} from "@/components/TextField";
import {QuietAction} from "@/components/Brief";
import {Surface} from "@/components/ui/Surface";
import {PersonPicker,SharedFrame,SharedLoading,SharedNotice,SharedSheet,sharedStyles as s,useSharedLedger} from "@/components/SharedExpenseUI";
import {fetchSharedBillSource,localToday,pendingSharedSave,saveSharedExpense,type ExpenseDetails,type SharedPayload,type SharedBillSource,type SharedCommand} from "@/lib/shared-expenses";
import {centsInput,equalExpenseShares,parseCadCents,sharedMoney,sumShares} from "@/lib/shared-expense-math";
import {AddExpensePerson,expensePersonStatus} from "@/components/ExpensePeople";
import {initialExpenseParticipants,hasSharedParticipants,expenseParticipantSummary} from "@/lib/shared-expense-participants";
import {ApiError} from "@/lib/api";
import {colors,typography} from "@/theme/tokens";

function ExpenseForm({data,id,source,reload,onReloadLatest,unavailable=false}:{data:SharedPayload;id?:string;source?:SharedBillSource;reload:()=>Promise<unknown>;onReloadLatest:()=>Promise<void>;unavailable?:boolean}){
 const router=useRouter(),navigation=useNavigation(),lock=useRef(false),attempt=useRef<SharedCommand|null>(null);
 const [splitOpen,setSplitOpen]=useState(false),[extrasOpen,setExtrasOpen]=useState(false);
 const [original]=useState(()=>id?data.entries.find(e=>e.id===id):null);
 const initial=original?.kind==="expense"?original.details:null;
 const [peopleOpen,setPeopleOpen]=useState(!initial);
 const [title,setTitle]=useState(initial?.title??source?.draft.title??""),[amount,setAmount]=useState(initial?centsInput(initial.amountCents):source?.draft.amountCents?centsInput(source.draft.amountCents):""),[date,setDate]=useState(initial?.happenedOn??(source?source.draft.paymentDate:localToday())),[note,setNote]=useState(initial?.note??"");
 const [payer,setPayer]=useState(initial?.paidBy??data.people.find(p=>p.self)?.id??""),[selected,setSelected]=useState<string[]>(initial?.shares.map(s=>s.personId)??initialExpenseParticipants(data.people));
 const [mode,setMode]=useState<"equal"|"exact">(initial?"exact":"equal"),[amounts,setAmounts]=useState<Record<string,string>>(Object.fromEntries(initial?.shares.map(s=>[s.personId,centsInput(s.cents)])??[]));
 const [error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false),[saved,setSaved]=useState<string|null>(null),[existing,setExisting]=useState(false);
 const [uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const blocked=saving||uncertain||conflict;
 const [defaults]=useState(()=>({payer,selected:[...selected],date}));
 const cents=parseCadCents(amount),people=data.people.filter(p=>p.state!=="former"||initial?.paidBy===p.id||initial?.shares.some(s=>s.personId===p.id));
 const shares=cents&&selected.length&&selected.length<=40?(mode==="equal"?equalExpenseShares(cents,selected):selected.map(personId=>({personId,cents:/^0(?:\.0{1,2})?$/.test(amounts[personId]??"")?0:parseCadCents(amounts[personId]??"")??-1}))):[];
 const correctShares=shares.length>0&&shares.every(s=>s.cents>=0)&&sumShares(shares)===(cents??-1);
 const valid=Boolean((Boolean(original)||hasSharedParticipants(people,selected,payer))&&!unavailable&&!data.archived&&selected.every(id=>people.some(p=>p.id===id))&&title.trim()&&cents&&payer&&correctShares&&date&&date<=localToday()&&date>="2000-01-01");
 const dirty=initial?title!==initial.title||amount!==centsInput(initial.amountCents)||date!==initial.happenedOn||note!==initial.note||payer!==initial.paidBy||JSON.stringify(shares)!==JSON.stringify(initial.shares):Boolean(title||amount||note||payer!==defaults.payer||date!==defaults.date||mode!=="equal"||JSON.stringify(selected)!==JSON.stringify(defaults.selected));
 usePreventRemove(dirty&&!saved,({data:action})=>{
  if(saving){Alert.alert("Saving expense","Wait for the result before leaving.");return;}
  Alert.alert("Leave this expense?",error?"If a save was interrupted, you can check it from Shared expenses. Other edits will not be saved.":"Your changes haven’t been saved.",[{text:"Keep editing",style:"cancel"},{text:"Leave",style:"destructive",onPress:()=>navigation.dispatch(action.action)}]);
 });
 useEffect(()=>{if(saved)router.replace({pathname:"/shared/[id]",params:groupParams(data,{id:saved,...(existing?{existing:"1"}:{saved:"1"})})});},[saved,existing,router,data]);
 async function submit(){
  if(lock.current||(!uncertain&&!valid))return;lock.current=true;setSaving(true);setError(null);
  const details:ExpenseDetails={title:title.trim(),amountCents:cents!,paidBy:payer,shares,happenedOn:date,note:note.trim()};
  try{
   const command=uncertain&&attempt.current?attempt.current:original?{operation:"edit" as const,id:original.id,version:original.version,details}:{operation:"create" as const,kind:"expense" as const,details,...(source?{sourceBillId:source.billId}:{})};
   attempt.current=command;
   const result=await saveSharedExpense(data.home.id,command,data.groupId,data.viewerId);
   setSaved(result.id!);
  }catch(e){
   const conflict=e instanceof ApiError?e.details as {existingEntryId?:unknown}|undefined:undefined;
   if(typeof conflict?.existingEntryId==="string"){setExisting(true);setSaved(conflict.existingEntryId);return;}
   const pending=await pendingSharedSave().catch(()=>undefined);
   const rejected=e instanceof ApiError&&[400,403,404,409].includes(e.status);
   setUncertain(Boolean(pending)||(!rejected&&pending===undefined));
   setConflict(e instanceof ApiError&&e.status===409&&!pending);
   setError(pending?"We couldn’t confirm the save. Your attempted details are kept. Check the save before changing them.":e instanceof ApiError?e.message:"Could not confirm your save. Try again with these details.");}
  finally{lock.current=false;setSaving(false);}
 }
 const name=(id:string)=>{const person=people.find(p=>p.id===id);return person?.self?"you":person?.name??"Former participant";};
 if(id&&!original)return <SharedNotice message="This expense is no longer available. Return to shared expenses to check its history."/>;
 if(original&&(!original.canEdit||original.kind!=="expense"))return <SharedNotice message="This entry can’t be edited. Open its details to see the latest state."/>;

 return <>
  <Text style={s.label}>{data.home.name} · CAD</Text>
  {source?<Text style={s.label}>{source.draft.amountBasis==="recorded_payment"?"Your recorded payment is filled in.":source.draft.amountBasis==="bill_amount"?"Bill amount filled in. Confirm what you actually paid.":"Enter the amount you actually paid."} The original bill stays private.</Text>:null}
  {error?<SharedNotice message={error}/>:null}
  {conflict?<Button label="Review latest expense" variant="secondary" onPress={()=>Alert.alert("Load the latest version?","Your unsaved changes will be replaced by the saved expense.",[{text:"Keep changes",style:"cancel"},{text:"Load latest",onPress:()=>void onReloadLatest()}])}/>:null}
  <View pointerEvents={blocked?"none":"auto"} style={{gap:20}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Choose people for this expense" accessibilityState={{expanded:peopleOpen}} onPress={()=>setPeopleOpen(true)} style={({pressed})=>({backgroundColor:pressed?colors.accent:colors.surfaceSubtle,borderRadius:16,padding:16,flexDirection:"row",alignItems:"center",gap:12})}>
    <Feather name="users" size={21} color={colors.primary}/><View style={{flex:1,gap:4}}><Text style={s.label}>Sharing with</Text><Text style={[s.body,{fontWeight:"600"}]}>{hasSharedParticipants(people,selected,payer)?expenseParticipantSummary(people,selected):"Choose who shares this expense"}</Text></View><Feather name="chevron-down" size={18} color={colors.primary}/>
   </Pressable>
   <TextField label="What was it for?" value={title} onChangeText={setTitle} maxLength={120} placeholder="Groceries, internet, a home repair…" editable={!blocked}/>
   <TextField label="Amount paid (CAD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={12} placeholder="0.00" editable={!blocked} style={{fontSize:30,minHeight:64,fontVariant:["tabular-nums"]}}/>
   <PersonPicker label="Paid by" people={people} value={payer} onChange={setPayer} disabled={blocked}/>
   <View style={{gap:12}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Change how this expense is split" accessibilityState={{expanded:splitOpen}} onPress={()=>setSplitOpen(true)} style={{minHeight:44,flexDirection:"row",gap:12,alignItems:"center"}}>
     <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,flex:1}]}>Everyone’s share</Text><Text style={[s.label,{color:colors.primary,fontWeight:"600"}]}>{mode==="equal"?"Equally":"Exact amounts"}</Text><Feather name="chevron-down" size={17} color={colors.primary}/>
    </Pressable>
    {hasSharedParticipants(people,selected,payer)?<View style={{backgroundColor:colors.surfaceRaised,borderRadius:16,paddingHorizontal:16}}>
     {selected.map(personId=><View key={personId} style={{flexDirection:"row",gap:16,paddingVertical:12,borderBottomWidth:personId===selected[selected.length-1]?0:1,borderBottomColor:colors.border}}><Text style={[s.body,{flex:1}]}>{name(personId)}</Text><Text style={[s.body,{fontVariant:["tabular-nums"]}]}>{shares.find(share=>share.personId===personId)?.cents!==undefined&&shares.find(share=>share.personId===personId)!.cents>=0?sharedMoney(shares.find(share=>share.personId===personId)!.cents):"—"}</Text></View>)}
    </View>:<QuietAction label="Choose people to see their shares" onPress={()=>setPeopleOpen(true)}/>}
    {mode==="exact"&&cents&&!correctShares?<Text accessibilityLiveRegion="polite" style={[s.label,{color:colors.warningForeground}]}>{sharedMoney(cents-sumShares(shares.filter(share=>share.cents>=0)))} left to allocate. Update exact amounts.</Text>:null}
   </View>
   <DateField label="Paid on" value={date} onChange={setDate}/>
   <QuietAction label={extrasOpen?"Hide note":"Add a note"} onPress={()=>setExtrasOpen(v=>!v)}/>
   {extrasOpen?<TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} multiline placeholder="Anything the people sharing should know" style={{minHeight:80,textAlignVertical:"top",paddingTop:12}}/>:null}
  </View>
  <View style={{gap:10}}>
   <Button label={uncertain?"Check saved expense":original?"Save changes":"Save expense"} disabled={conflict||(!uncertain&&!valid)} loading={saving} onPress={()=>void submit()}/>
   <Text style={s.label}>Visible to people who have joined this expense group or household. Records a payment already made; no money moves.</Text>
  </View>
  <SharedSheet title="Who shares this expense?" visible={peopleOpen} disabled={blocked} onClose={()=>setPeopleOpen(false)}>
   <View>{people.map(person=>{
    const checked=selected.includes(person.id);
    return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={person.self?"Include yourself":person.name} onPress={()=>{if(!checked&&selected.length>=40){setError("Choose up to 40 people.");return;}setSelected(ids=>checked?ids.filter(id=>id!==person.id):[...ids,person.id]);}} style={{minHeight:60,paddingVertical:12,flexDirection:"row",gap:12,alignItems:"center",borderBottomWidth:1,borderColor:colors.border}}>
     <View style={{flex:1,gap:3}}><Text style={s.body}>{person.self?"You":person.name}</Text>{!person.self?<Text style={s.label}>{expensePersonStatus(person)}</Text>:null}</View><Feather name={checked?"check-circle":"circle"} size={22} color={checked?colors.primary:colors.mutedForeground}/>
    </Pressable>;
   })}</View>
   {data.role==="owner"?<AddExpensePerson expectedUserId={data.viewerId} groupId={data.groupId} homeId={data.home.id} initialOpen={!people.some(p=>!p.self)} onAdded={async personId=>{if(!await reload())throw Error("Refresh failed");setSelected(ids=>ids.includes(personId)?ids:[...ids,personId]);}}/>:!people.some(p=>!p.self)?<Text style={s.body}>Ask the household owner to add someone to the expense list.</Text>:null}
   <Text accessibilityLiveRegion="polite" style={s.label}>{selected.length} {selected.length===1?"person":"people"} selected. Only selected people share this expense.</Text>
   <Text style={s.label}>Someone can share a cost without joining Rezlee. Adding their name sends no invitation.</Text>
   <Button label="Done" onPress={()=>setPeopleOpen(false)}/>
  </SharedSheet>
  <SharedSheet title="How should it be split?" visible={splitOpen} disabled={blocked} onClose={()=>setSplitOpen(false)}>
   <View style={{flexDirection:"row",gap:20}}>{(["equal","exact"] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:mode===value}} onPress={()=>{
    if(value==="exact"&&mode!=="exact")setAmounts(Object.fromEntries(shares.map(share=>[share.personId,centsInput(share.cents)])));
    setMode(value);
   }} style={{minHeight:44,justifyContent:"center",borderBottomWidth:mode===value?2:0,borderColor:colors.primary}}><Text style={[s.body,{color:mode===value?colors.primary:colors.mutedForeground,fontWeight:mode===value?"600":"400"}]}>{value==="equal"?"Equally":"Exact amounts"}</Text></Pressable>)}</View>
   {selected.map(personId=><View key={personId} style={{flexDirection:"row",alignItems:"center",gap:12}}><Text style={[s.body,{flex:1}]}>{name(personId)}</Text>{mode==="exact"?<View style={{width:120}}><TextField label={name(personId)+"’s share"} value={amounts[personId]??""} onChangeText={value=>setAmounts(old=>({...old,[personId]:value}))} keyboardType="decimal-pad" maxLength={12} placeholder="0.00"/></View>:<Text style={s.body}>{shares.find(share=>share.personId===personId)?sharedMoney(shares.find(share=>share.personId===personId)!.cents):"—"}</Text>}</View>)}
   {mode==="exact"&&cents?<Text accessibilityLiveRegion="polite" style={[s.label,{color:correctShares?colors.successForeground:colors.warningForeground}]}>{correctShares?"Shares add up.":sharedMoney(cents-sumShares(shares.filter(share=>share.cents>=0)))+" left to allocate."}</Text>:null}
   {mode==="equal"&&cents&&selected.length&&cents%selected.length!==0?<Text style={s.label}>Rounding cents are distributed so the shares equal the total.</Text>:null}
   <Button label="Done" onPress={()=>setSplitOpen(false)}/>
  </SharedSheet>
 </>;
}

export default function EditSharedExpense(){
 const {id,billId,groupId}=useLocalSearchParams<{id?:string;billId?:string;groupId?:string}>(),router=useRouter(),{data,error,busy,load}=useSharedLedger(id);
 const [formVersion,setFormVersion]=useState(0);
 const [source,setSource]=useState<SharedBillSource|null>(null),[sourceError,setSourceError]=useState<string|null>(null);
 const fetchSource=useCallback(async()=>{
  if(!billId||groupId)return;
  try{const result=await fetchSharedBillSource(billId);setSource(result);setSourceError(null);}
  catch(e){setSource(null);setSourceError(e instanceof ApiError?e.message:"Could not read this saved bill.");}
 },[billId,groupId]);
 useFocusEffect(useCallback(()=>{void fetchSource();},[fetchSource]));
 if(billId&&groupId)return <SharedFrame title="Share a bill amount"><SharedNotice message="Saved bill sharing uses your household expenses. For a separate group, add the shared amount as a new expense. Your original bill stays private."/><Button label="Open household bill sharing" onPress={()=>router.replace({pathname:"/shared/edit",params:{billId}})}/><Button label="Add group expense" variant="secondary" onPress={()=>router.replace({pathname:"/shared/edit",params:{groupId}})}/></SharedFrame>;
 const matchingSource=source&&source.billId===billId&&source.homeId===data?.home.id?source:undefined;
 return <SharedFrame title={id?"Correct expense":billId?"Share a bill amount":"Add shared expense"}>
  {error?<SharedNotice message={error} onRetry={()=>void load()}/>:null}
  {sourceError?<SharedNotice message={sourceError} onRetry={()=>void fetchSource()}/>:null}
  {(busy&&!data)||(billId&&!matchingSource&&!sourceError)?<SharedLoading/>:null}
  {matchingSource?.existingEntryId?<Surface tone="subtle" style={{gap:16}}><Text style={s.heading}>This bill has a shared expense</Text><Text style={s.body}>Open the saved entry to review or correct it. It won’t be added twice.</Text><Button label="View shared expense" onPress={()=>router.replace({pathname:"/shared/[id]",params:{id:matchingSource.existingEntryId!}})}/></Surface>:data&&!sourceError&&(!billId||matchingSource)?<ExpenseForm key={data.home.id+(id??billId??"new")+formVersion} data={data} id={id} source={matchingSource} reload={load} onReloadLatest={async()=>{if(await load())setFormVersion(v=>v+1);}} unavailable={Boolean(error)}/>:null}
 </SharedFrame>;
}
