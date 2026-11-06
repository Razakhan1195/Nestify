import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneySteps} from "@/components/JourneyUI";
import * as ImagePicker from "expo-image-picker";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {apiFormPost} from "@/lib/api";
import {useCallback,useRef,useState} from "react";
import {useFocusEffect,useLocalSearchParams,useRouter,Stack} from "expo-router";
import { ActivityIndicator, Alert, BackHandler, Linking, Share, Text, TextInput, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {randomUUID} from "expo-crypto";
import {Button} from "@/components/Button";
import {QuietAction} from "@/components/Brief";
import {ActionCard} from "@/components/ActionCard";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {fetchRepairs,pendingRepair,saveRepair,repairStatus,type RepairIntake,type RepairPayload,type RepairChange,type RepairIntent} from "@/lib/repair-data";
import {colors,layout,radii,spacing,typography} from "@/theme/tokens";
const initial:RepairIntake={title:"",description:"",category:"other",equipment:"",context:"owner",hazard:"unsure"};
function Field({label,value,onChange,multiline=false,maxLength=1500,disabled=false,placeholder}:{disabled?:boolean;label:string;value:string;onChange:(value:string)=>void;multiline?:boolean;maxLength?:number;placeholder?:string}){
 return <View style={{gap:8}}><Text style={[typography.section,{color:colors.foreground}]}>{label}</Text><TextInput editable={!disabled} accessibilityState={{disabled}} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} value={value} onChangeText={onChange} multiline={multiline} maxLength={maxLength} textAlignVertical="top" style={[typography.body,{color:colors.foreground,backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.border,borderRadius:radii.lg,padding:14,minHeight:multiline?110:48}]}/></View>;
}
function Copy({children}:{children:React.ReactNode}){return <Text style={[typography.body,{color:colors.mutedForeground}]}>{children}</Text>;}
function Panel({children,tone=colors.surfaceRaised}:{children:React.ReactNode;tone?:string}){return <View style={{padding:18,borderRadius:20,backgroundColor:tone,gap:12,borderWidth:1,borderColor:colors.border}}>{children}</View>;}
export default function Repairs(){
 const router=useRouter(),params=useLocalSearchParams<{id?:string;start?:string;careTaskTitle?:string}>();
 const [payload,setPayload]=useState<RepairPayload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
 const [pending,setPending]=useState<RepairIntent|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
 const [intake,setIntake]=useState<RepairIntake>(()=>({...initial,description:typeof params.careTaskTitle==="string" ? "After this home check: "+params.careTaskTitle.slice(0,140)+"\nI noticed: " : ""})),[safetyChosen,setSafetyChosen]=useState(false),[stage,setStage]=useState<"describe"|"safety">("describe");
 const [detailOpen,setDetailOpen]=useState(false);
 const [note,setNote]=useState(""),[brief,setBrief]=useState<string|null>(null),[history,setHistory]=useState(false),[ending,setEnding]=useState<"resolve"|"reopen"|null>(null);
 const [photoBusy,setPhotoBusy]=useState(false),[photoDraft,setPhotoDraft]=useState<{observation:string;equipment:string;uncertainty:string;possibleHazard:boolean}|null>(null);
 const photoLock=useRef(false);
 const lock=useRef(false),epoch=useRef(0),reading=useRef(false);
 const issue=payload?.issues.find(i=>i.id===params.id),creating=params.start==="1";
 const preparing=issue?.progress.guidance?.state==="reading";
 const load=useCallback(async()=>{
  if(lock.current)return;reading.current=true;
  const current=++epoch.current;
  try{const [data,retry]=await Promise.all([fetchRepairs(params.id),pendingRepair()]);if(current===epoch.current){setPayload(data);setPending(retry);setError(null);}}
  catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:"Could not load your issues. Try again.");}
  finally{if(current===epoch.current){reading.current=false;setLoading(false);}}
 },[params.id]);
 useFocusEffect(useCallback(()=>{void load();return()=>{epoch.current++;reading.current=false;};},[load]));
 useFocusEffect(useCallback(()=>{
  if(!preparing)return;
  let polls=0;const timer=setInterval(()=>{if(++polls>20){clearInterval(timer);setError("Could not confirm guidance yet. Your saved issue is kept. Reload when you’re connected.");return;}if(!reading.current)void load();},4000);
  return()=>clearInterval(timer);
 },[preparing,load]));
 async function readPhoto(useCamera=false){
  if(photoLock.current||!payload||!payload.photoReadingAvailable)return;photoLock.current=true;setPhotoBusy(true);setError(null);
  try{
   if(useCamera){
    const permission=await ImagePicker.requestCameraPermissionsAsync();
    if(!permission.granted){setError("Camera access is off. Choose an existing photo or allow camera access in your phone’s Settings.");return;}
   }
   const chosen=useCamera
    ?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:0.8})
    :await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.8});
   if(chosen.canceled||!chosen.assets[0])return;
   const asset=chosen.assets[0];
   let photo;
   try{photo=await prepareAttachment({uri:asset.uri,name:asset.fileName??"repair-photo.jpg",type:asset.mimeType??"image/jpeg",size:asset.fileSize,width:asset.width,height:asset.height});}
   catch{setError("We couldn’t prepare this photo. Choose a clearer image or continue with your description.");return;}
   const form=new FormData();form.append("homeId",payload.homeId);form.append("file",{uri:photo.uri,name:photo.name,type:photo.type} as unknown as Blob);
   const result=await apiFormPost<{data:{observation:string;equipment:string;uncertainty:string;possibleHazard:boolean}}>("/api/mobile/v1/repairs/photo",form);
   setPhotoDraft(result.data);
   if(result.data.possibleHazard){setIntake(v=>({...v,hazard:"unsure"}));setSafetyChosen(false);}
  }catch(e){setError(e instanceof Error?e.message:"Could not read the photo. Continue with your description.");}
  finally{photoLock.current=false;setPhotoBusy(false);}
 }
 async function submit(intent:RepairIntent){
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);setMessage(null);epoch.current++;reading.current=false;
  try{
   const saved=await saveRepair(intent);
   setPending(null);setNote("");setDetailOpen(false);setBrief(intent.operation==="change"&&["brief","escalate"].includes(intent.change.action)?saved.brief:null);setEnding(null);
   setPayload(p=>p?{...p,issues:[saved,...p.issues.filter(i=>i.id!==saved.id)]}:p);
   setMessage(saved.status==="resolved"?"Resolution saved. Reopen this if the problem returns.":saved.progress.guidance?.state==="reading"?"Your issue is saved. You can leave while guidance is prepared.":"Progress saved.");
   if(!params.id||saved.id!==params.id)router.replace({pathname:"/repairs",params:{id:saved.id}});
  }catch(e){setError(e instanceof Error?e.message:"Could not save. Your current details are kept.");setPending(await pendingRepair().catch(()=>null));}
  finally{lock.current=false;setBusy(false);}
 }
 function change(change:RepairChange){if(issue&&payload)void submit({operation:"change",id:issue.id,homeId:payload.homeId,version:issue.version,requestId:randomUUID(),change});}
 const leave=useCallback(()=>{
  if(creating&&stage==="safety"){setStage("describe");return;}
  const dirty=(creating&&(intake.description||intake.equipment))||note||brief!==null;
  const back=()=>router.canGoBack()?router.back():router.replace("/(tabs)/care");
  if(photoBusy)return;
  if(dirty)Alert.alert("Leave without saving these edits?","Previously saved progress is kept.",[{text:"Keep editing",style:"cancel"},{text:"Leave",style:"destructive",onPress:back}]);else back();
 },[creating,stage,intake.description,intake.equipment,note,brief,router,photoBusy]);
 const disabled=busy||photoBusy||!!pending;
 useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener("hardwareBackPress",()=>{if(!busy)leave();return true;});return()=>sub.remove();},[leave,busy]));
 const helpReady=!!issue&&!issue.step&&issue.status!=="resolved"&&!preparing;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
 <Stack.Screen options={{gestureEnabled:!(creating||note||brief!==null||busy)}}/>
 <ScreenNavigation title="Help me fix this" fallback="/(tabs)/care" onBack={leave} disabled={busy}/>
 <View style={{flex:1}} >
 <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:layout.screenHorizontal,gap:spacing.xl,paddingBottom:40}}>
 {loading?<ActivityIndicator accessibilityLabel="Loading repair progress" color={colors.primary}/>:null}
 {error?<Panel tone={colors.warningBg}><Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.warningForeground}]}>{error}</Text><QuietAction label="Reload saved progress" disabled={busy} onPress={()=>void load()}/></Panel>:null}
 {pending?<Panel><Copy>A save needs confirmation. Retry it before making another change; this will not create a second issue.</Copy><Button label="Confirm previous save" loading={busy} onPress={()=>void submit(pending)}/></Panel>:null}
 {message?<Text accessibilityLiveRegion="polite" style={[typography.meta,{color:colors.successForeground}]}>{message}</Text>:null}
 {payload&&!payload.canCreate?<><Copy>Your household owner manages saved repair cases. You can still ask Rezlee a home-care question.</Copy><Button label="Ask Rezlee" onPress={()=>router.push("/assistant")}/></>:null}
 {payload&&payload.canCreate&&!creating&&!params.id?<>
 <JourneyHeading title="Let’s work out the next step." detail="Start with what’s going wrong. Keep the checks you try and prepare a clear request if you need help."/><Panel tone={colors.surfaceSubtle}><Copy>You can begin with a description. A model number or home inventory is optional.</Copy><Button label="Get help with a problem" disabled={disabled} onPress={()=>{setStage("describe");router.push({pathname:"/repairs",params:{start:"1"}});}}/></Panel>
 <Text style={[typography.section,{color:colors.foreground}]}>Your saved issues</Text>
 {!payload.issues.length?<Copy>No issues yet. Start with a description — you don’t need an inventory or model number.</Copy>:payload.issues.map(i=><ActionCard key={i.id} title={i.title} detail={i.progress.guidance?.state==="reading"?"Preparing guidance · progress saved":repairStatus(i.status)} icon={i.status==="resolved"?"check-circle":"tool"} onPress={()=>router.push({pathname:"/repairs",params:{id:i.id}})}/>)}
 {payload.issues.length===50?<Copy>Showing your 50 most recent issues.</Copy>:null}
 </>:null}
 {payload&&payload.canCreate&&creating?<>
 <JourneySteps labels={["The problem","Safety first"]} current={stage==="describe"?0:1}/>
 {stage==="describe"?<>
 <JourneyHeading title={params.careTaskTitle?"What did you notice?":"What’s going wrong?"}/>{params.careTaskTitle?<Copy>Your maintenance task is already complete. Describe the concern below; nothing is submitted until you choose to continue.</Copy>:null}
 <Copy>Describe what happens. Rezlee uses reliable guidance and your answers to work through safe checks with you.</Copy>
 <Field disabled={disabled} label="Describe the problem" placeholder="For example: the kitchen faucet drips even when it’s turned off." value={intake.description} multiline onChange={description=>setIntake(v=>({...v,description,title:description.trim().split("\n")[0].slice(0,120)}))}/>
 <ActionCard title={photoBusy?"Reading your photo…":payload.photoReadingAvailable?"Add a photo or equipment label":"Photo review is temporarily unavailable"} detail={payload.photoReadingAvailable?"Take a photo or choose one you already have.":"You can describe the concern and continue with the available repair checks."} icon="camera" disabled={disabled||!payload.photoReadingAvailable} onPress={()=>Alert.alert("Add a photo","Rezlee reads visible details for you to review. The photo is not saved with this issue.",[{text:"Take photo",onPress:()=>void readPhoto(true)},{text:"Choose photo",onPress:()=>void readPhoto(false)},{text:"Cancel",style:"cancel"}])}/>
 <Text style={[typography.meta,{color:colors.mutedForeground}]}>Optional. AI reads visible details for you to review. The photo is not saved with this issue.</Text>
 {photoDraft?<Panel><Text style={[typography.section,{color:colors.foreground}]}>Review what the photo shows</Text><Copy>{photoDraft.observation}</Copy><Copy>{photoDraft.uncertainty}</Copy>{photoDraft.possibleHazard?<Safety/>:null}<Button label="Use these details" disabled={disabled} onPress={()=>{setIntake(v=>{const description=[v.description,photoDraft.observation].filter(Boolean).join("\n").slice(0,1500);return {...v,description,title:description.trim().split("\n")[0].slice(0,120),equipment:v.equipment||photoDraft.equipment};});setPhotoDraft(null);}}/><QuietAction label="Discard photo details" onPress={()=>setPhotoDraft(null)}/></Panel>:null}
 <Field disabled={disabled} label="Brand or model, if you know it" placeholder="Optional — you can start without this" value={intake.equipment} maxLength={180} onChange={equipment=>setIntake(v=>({...v,equipment}))}/>
 <Text style={[typography.section,{color:colors.foreground}]}>Is this a place you rent or own?</Text>
 <View style={{gap:8}}>{(["owner","renter"] as const).map(context=><Button key={context} label={(intake.context===context?"✓ ":"")+(context==="renter"?"I rent":"I own")} variant={intake.context===context?"primary":"secondary"} disabled={disabled} onPress={()=>setIntake(v=>({...v,context}))}/>)}</View>
 <Button label="Continue" disabled={disabled||intake.description.trim().length<8} onPress={()=>setStage("safety")}/>
 </>:<>
 <JourneyHeading title="First, check it’s safe."/>
 <Copy>This determines whether a home check is appropriate. Choose the closest answer.</Copy>
 {([["gas_co_fire","Gas smell, smoke, sparks or a CO alarm"],["water_electricity","Flooding or water near electricity"],["unsure","I’m unsure"],["none","None of these"]] as const).map(([value,label])=><Button key={value} label={(safetyChosen&&intake.hazard===value?"✓ ":"")+label} variant={safetyChosen&&intake.hazard===value?"primary":"secondary"} disabled={disabled} onPress={()=>{setSafetyChosen(true);setIntake(v=>({...v,hazard:value}));}}/>)}
 {safetyChosen&&intake.hazard!=="none"?<Safety/>:null}
 <Text style={[typography.meta,{color:colors.mutedForeground}]}>Saved privately in {payload.homeName}. AI adapts guidance to your answers; it does not confirm a diagnosis.</Text>
 <Button label={safetyChosen&&intake.hazard!=="none"?"Save this issue":"Get my next step"} loading={busy} disabled={disabled||!safetyChosen} onPress={()=>void submit({operation:"create",id:randomUUID(),homeId:payload.homeId,intake})}/>
 </>}
 </>:null}
 {issue?<>
 <JourneyHeading eyebrow={issue.status==="resolved"?"Resolved":preparing?"Finding guidance":helpReady?"Next step: get help":"Your repair guide"} title={issue.title}/>
 {preparing?<Panel tone={colors.infoBg}><ActivityIndicator color={colors.primary}/><Text style={[typography.section,{color:colors.foreground}]}>Preparing your next step</Text><Copy>Your issue is saved. You can use the rest of Rezlee and return here.</Copy></Panel>:<>
 {issue.progress.blocked&&issue.status!=="resolved"?<Safety/>:null}
 {issue.outcome?<Panel tone={issue.status==="resolved"?colors.successBg:colors.surfaceSubtle}><Text style={[typography.section,{color:colors.foreground}]}>{issue.outcome.title}</Text><Copy>{issue.outcome.summary}</Copy>{helpReady?<Copy>{issue.outcome.next}</Copy>:null}</Panel>:null}
 {issue.progress.guidance?.state==="fallback"&&issue.status!=="resolved"&&!issue.progress.blocked&&!issue.progress.reopened&&brief===null&&!ending?<View style={{gap:8}}><Text style={[typography.meta,{color:colors.mutedForeground}]}>{issue.progress.guidance.reason}</Text><QuietAction label="Try preparing guidance again" disabled={disabled} onPress={()=>change({action:"tailor"})}/></View>:null}
 {!issue.progress.adaptiveEnabled&&issue.status!=="resolved"&&!issue.progress.blocked&&!issue.progress.reopened&&brief===null&&!ending?<ActionCard title="Get more relevant guidance" detail="Keep your saved history and find checks for this problem." icon="tool" disabled={disabled} onPress={()=>change({action:"tailor"})}/>:null}
 {issue.progress.adaptive?.uncertainty&&issue.step?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{issue.progress.adaptive.uncertainty}</Text>:null}
 {issue.step&&!ending?<Panel>
 <Text style={[typography.meta,{color:colors.primary}]}>One check at a time · {issue.progress.attempts.length} saved</Text>
 <Text style={[typography.title,{color:colors.foreground}]}>{issue.step.title}</Text><Copy>{issue.step.detail}</Copy>
 {issue.step.why?<View style={{paddingLeft:12,borderLeftWidth:3,borderLeftColor:colors.accent}}><Text style={[typography.meta,{color:colors.mutedForeground}]}>{issue.step.why}</Text></View>:null}
 {issue.step.source?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Source checked {new Date(issue.step.source.checkedAt).toLocaleDateString("en-CA")} · General guidance; your model manual takes priority.</Text>:null}
 {issue.step.source?<QuietAction label={issue.step.source.label+" ↗"} onPress={()=>void Linking.openURL(issue.step!.source!.url).catch(()=>setError("Could not open the guidance. Try again."))}/>:null}
 {(issue.step.kind==="observe"&&!issue.step.choices)||detailOpen?<Field disabled={disabled} label={issue.step.kind==="observe"?"What did you find?":"Anything else to tell Rezlee? (optional)"} placeholder={issue.step.kind==="observe"?"Add what you see or what you are unsure about.":"Describe what happened or ask about this step."} value={note} maxLength={1000} multiline onChange={setNote}/>:<QuietAction label="Add a detail or question" disabled={disabled} onPress={()=>setDetailOpen(true)}/>}
 {issue.step.choices?<View style={{gap:8}}>{issue.step.choices.map(option=><Button key={option.id} label={option.label} variant="secondary" disabled={disabled} onPress={()=>change({action:"respond",stepId:issue.step!.id,answer:"checked",choice:option.id,note})}/>)}</View>:<>
 
 {issue.step.kind==="observe"?<Button label="Save and continue" disabled={disabled||!note.trim()} onPress={()=>change({action:"respond",stepId:issue.step!.id,answer:"checked",note})}/>:<><Button label="That fixed it" disabled={disabled} onPress={()=>change({action:"respond",stepId:issue.step!.id,answer:"worked",note})}/><Button label="Still happening" variant="secondary" disabled={disabled} onPress={()=>change({action:"respond",stepId:issue.step!.id,answer:"did_not_work",note})}/></>}
 </>}
 <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{([["cannot","Can’t do this"],["unsure","I’m unsure"]] as const).map(([answer,label])=><QuietAction key={answer} label={label} disabled={disabled} onPress={()=>change({action:"respond",stepId:issue.step!.id,answer,note})}/>)}</View>
 </Panel>:null}
 {issue.safetySources.map(source=><QuietAction key={source.url} label={source.label+" ↗"} onPress={()=>void Linking.openURL(source.url).catch(()=>setError("Could not open this source."))}/>)}
 {!ending&&(brief===null?<ActionCard title={issue.status==="resolved"?"View saved service brief":helpReady?"Review your help request":"Stop and get help"} detail={issue.status==="resolved"?"Keep the symptoms, checks and outcome together.":helpReady?"Your symptoms and saved checks are already included. Review before sharing.":"Stop here if you prefer. Turn what you know into a request for your landlord or a professional."} icon="file-text" disabled={disabled} onPress={()=>{if(issue.step)change({action:"escalate"});else setBrief(issue.brief);}}/>:<Panel>
 <Text style={[typography.section,{color:colors.foreground}]}>Your request for help</Text><Field disabled={disabled} label="Review and edit" value={brief} onChange={setBrief} multiline maxLength={6000}/>
 <Copy>Nothing is sent or booked automatically. Add receipt or warranty details if relevant; coverage has not been verified.</Copy>
 <Button label="Save request" disabled={disabled||brief.trim().length<10||brief===issue.brief} onPress={()=>change({action:"brief",text:brief})}/>
 <Button label="Share saved request" variant="secondary" disabled={disabled||brief!==issue.brief} onPress={()=>void Share.share({message:issue.brief}).catch(()=>setError("Could not open sharing. Your request is saved."))}/>
 <QuietAction label="Close request" disabled={disabled} onPress={()=>{if(brief!==issue.brief)Alert.alert("Discard unsaved edits?","Your saved request is kept.",[{text:"Keep editing",style:"cancel"},{text:"Discard",style:"destructive",onPress:()=>setBrief(null)}]);else setBrief(null);}}/>
 </Panel>)}
 </>}
 {!preparing?<View style={{gap:10}}>
 <Button label="Review a quote for this issue" variant="secondary" disabled={disabled||!!note} onPress={()=>router.push({pathname:"/quotes",params:{issueId:issue.id}})}/>
 <QuietAction label={history?"Hide saved checks":"View saved checks ("+issue.progress.attempts.length+")"} onPress={()=>setHistory(v=>!v)}/>
 {history?<>{!issue.progress.attempts.length?<Copy>No checks recorded yet.</Copy>:issue.progress.attempts.map((a,i)=><Panel key={i}><Text style={[typography.section,{color:colors.foreground}]}>{a.title}</Text><Copy>{a.answer.replaceAll("_"," ")}{a.choice?" · "+(a.choiceLabel??a.choice):""} · {new Date(a.at).toLocaleDateString("en-CA")}</Copy>{a.note?<Copy>{a.note}</Copy>:null}</Panel>)}</>:null}
 <QuietAction label={issue.status==="resolved"?"The problem returned":"Record a resolution"} disabled={disabled} onPress={()=>{setEnding(issue.status==="resolved"?"reopen":"resolve");setNote("");}}/>
 {ending?<Panel><Field disabled={disabled} label={ending==="resolve"?"What resolved it?":"What happened again?"} value={note} multiline maxLength={1000} onChange={setNote}/><Button label={ending==="resolve"?"Save resolution":"Reopen issue"} disabled={disabled||note.trim().length<3} onPress={()=>change({action:ending,note})}/><QuietAction label="Cancel" disabled={disabled} onPress={()=>{setEnding(null);setNote("");}}/></Panel>:null}
 </View>:null}
 </>:null}
 </FormScrollView></View></SafeAreaView>;
}
function Safety(){return <Panel tone={colors.criticalBg}><Text style={[typography.section,{color:colors.criticalForeground}]}>Pause troubleshooting</Text><Copy>If you suspect a gas leak, see fire or hear a CO alarm, leave the area and call emergency services from a safe location. Avoid switches or equipment near a suspected gas leak. Stay out of water near electrical equipment. If unsure, keep away and get qualified help. Do not wait for Rezlee to save or respond.</Copy></Panel>;}
