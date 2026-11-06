import {useNavigation} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import {useRef,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {Button} from './Button';
import {TextField} from './TextField';
import {QuietAction} from './Brief';
import {JourneyDisclosure} from './JourneyUI';
import {apiFormPost,ApiError} from '@/lib/api';
import {prepareAttachment} from '@/lib/prepare-attachment';
import {RECORD_PICKER_TYPES,RECORD_FILE_TYPES,uploadMimeType,uploadValidationError} from '@/lib/upload-validation';
import {parseOfferReading,type OfferReading} from '@/lib/offer-reading';
import {colors,typography} from '@/theme/tokens';
type Attachment={uri:string;name:string;type:string;size?:number};
const labels={monthly:'Monthly price',promoMonths:'Promotion length',afterPromo:'Price afterward',upfront:'Setup and equipment',exitFee:'Leaving your current plan',credit:'One-time credit'};
export function OfferReader({billId,source,disabled,onBusy,onRead,onApply}:{billId:string;source:OfferReading|null;disabled:boolean;onBusy:(busy:boolean)=>void;onRead:(reading:OfferReading)=>void;onApply:()=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[file,setFile]=useState<Attachment|null>(null),[consent,setConsent]=useState(false),[error,setError]=useState(''),[reading,setReading]=useState(false);const lock=useRef(false);
 const navigation=useNavigation(),[pendingInput,setPendingInput]=useState(false);
 usePreventRemove(pendingInput&&!disabled,({data})=>Alert.alert('Leave this unread offer?','The file or text you have not read will not be kept. Saved offer details remain.',[{text:'Keep reviewing',style:'cancel'},{text:'Leave',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]));
 const body=(value:string)=><Text style={[typography.body,{color:colors.mutedForeground}]}>{value}</Text>;
 async function pick(){if(lock.current||disabled)return;lock.current=true;onBusy(true);try{const result=await DocumentPicker.getDocumentAsync({type:RECORD_PICKER_TYPES,multiple:false,copyToCacheDirectory:true});if(result.canceled)return;const f=result.assets[0],ready=await prepareAttachment({uri:f.uri,name:f.name,type:uploadMimeType(f.name,f.mimeType),size:f.size});const issue=uploadValidationError(ready.size,ready.type,RECORD_FILE_TYPES);if(issue)throw Error(issue);setFile(ready);setPendingInput(true);setText('');setConsent(false);setError('');}catch{setError('Could not prepare this file. Choose a PDF or another photo, or paste the terms.');}finally{lock.current=false;onBusy(false);}}
 async function read(){if(lock.current||disabled||!consent||(!file&&!text.trim()))return;lock.current=true;setReading(true);onBusy(true);setError('');try{
  const form=new FormData();form.append('consent','true');if(file)form.append('file',{uri:file.uri,name:file.name,type:file.type} as unknown as Blob);else form.append('text',text.trim());
  const result=await apiFormPost<{reading:unknown}>('/api/mobile/v1/bills/'+encodeURIComponent(billId)+'/offers/read',form,{timeoutMs:55000});const parsed=parseOfferReading(result.reading);if(!parsed)throw Error('Invalid reading');onRead(parsed);setPendingInput(false);
 }catch(e){setError(e instanceof ApiError?e.message:'Could not read this offer. Your entered terms are kept; try again when ready.');}finally{lock.current=false;setReading(false);onBusy(false);}}
 return <JourneyDisclosure label="Read a written offer" open={open} onToggle={()=>setOpen(v=>!v)} disabled={disabled}>
 {body('Choose a photo or PDF, or paste the offer. Review the suggested terms before using them. Your existing entries will stay.')}
 {file?<View style={{gap:8}}>{body(file.name)}<QuietAction label="Use pasted text instead" disabled={disabled} onPress={()=>{setFile(null);setPendingInput(Boolean(text));setConsent(false);}}/></View>:<TextField label="Written offer text" multiline maxLength={12000} value={text} editable={!disabled} onChangeText={v=>{setText(v);setPendingInput(Boolean(v.trim()));setConsent(false);}}/>}
 <QuietAction label={file?'Choose another offer file':'Choose an offer file'} disabled={disabled} onPress={()=>void pick()}/>
 {body('The file is used for this reading. It is not saved in Vault. Saving the offer keeps the suggested terms and quoted passages with your bill.')}
 <Pressable accessibilityRole="checkbox" accessibilityLabel="Use AI to read this offer" accessibilityState={{checked:consent,disabled}} disabled={disabled} onPress={()=>setConsent(v=>!v)} style={{minHeight:48,paddingVertical:10}}><Text style={[typography.body,{color:colors.primary}]}>{consent?'✓ ':'○ '}Use AI to read this offer. I’ll check the result.</Text></Pressable>
 <Button label={reading?'Reading offer…':'Read offer'} loading={reading} disabled={disabled||!consent||(!file&&!text.trim())} onPress={()=>void read()}/>
 {error?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text>:null}
 {source?<View style={{gap:12}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Check the suggested terms</Text>{body(source.source.name)}
 {source.currency!=='CAD'?body('Canadian currency was not confirmed. These suggestions will not fill the calculator. Confirm the currency and enter applicable CAD terms yourself.'):null}
 {!source.facts.length?body('No clear numeric terms were found. You can still enter them yourself.'):source.facts.map(f=><View key={f.key} style={{gap:4}}><Text style={[typography.body,{color:colors.foreground,fontWeight:'600'}]}>{labels[f.key]}: {f.key==='promoMonths'?f.value+' months':(source.currency==='CAD'?'CAD $':'')+f.value}</Text>{body('“'+f.excerpt+'”'+(f.page?' · Page '+f.page:''))}</View>)}
 {source.notes.map((note,i)=><View key={i}>{body(note)}</View>)}
 <Button variant="secondary" label="Fill empty fields with these suggestions" disabled={disabled||source.currency!=='CAD'||!source.facts.length} onPress={()=>Alert.alert('Use these suggestions?','Check each quote against your offer. Existing entries stay unchanged; missing fees remain blank.',[{text:'Keep reviewing',style:'cancel'},{text:'Use suggestions',onPress:onApply}])}/>
 {body('Select Save offer details below to keep the source passages. Reading and filling fields do not save or accept an offer.')}
 </View>:null}
 </JourneyDisclosure>;
}
