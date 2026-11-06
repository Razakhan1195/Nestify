import {EnergyEvidenceReview} from "./EnergyEvidenceReview";
import {useState} from "react";
import {Text,View} from "react-native";
import {QuietAction} from "./Brief";
import {TextField} from "./TextField";
import {DateField} from "./DateField";
import {CollectionFilter} from "./CollectionPages";
import {editIntakeEvidence,hasIntakeEvidence,type IntakeEvidence} from "@/lib/statement-intake-evidence";
import {evidenceError,type StatementEvidence} from "@/lib/statement-evidence";
import {colors,typography} from "@/theme/tokens";
const labels:Record<keyof StatementEvidence,string>={previousBalance:"Previous balance",amountDue:"Amount due when issued",subtotal:"Subtotal before tax and credits",tax:"Tax",credits:"Discounts and credits",usage:"Period usage",unit:"Usage unit",reading:"Reading type",ratePlan:"Plan",discountEnds:"Discount ends"};
export function StatementIntakeDetails({value,disabled,onChange}:{value:IntakeEvidence;disabled:boolean;onChange:(next:IntakeEvidence)=>void}){
 const [editing,setEditing]=useState(false),[sources,setSources]=useState(false);
 if(!hasIntakeEvidence(value)&&!value.edited?.length)return null;
 const change=(key:keyof StatementEvidence,v:string)=>onChange(editIntakeEvidence(value,key,v));
 const error=evidenceError(value.fields);
 return <View style={{gap:12,paddingVertical:16,borderTopWidth:1,borderColor:colors.border}}>
  <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Details from your statement</Text>
  <Text style={[typography.meta,{color:colors.mutedForeground}]}>Check these before saving. A blank means unknown. Balances do not tell us whether you paid.</Text>
  {value.energy?<EnergyEvidenceReview value={value.energy} disabled={disabled} onChange={energy=>onChange({...value,energy,energyEdited:true})}/>:null}
  {editing||error?<>
   {(["subtotal","tax","credits","previousBalance","amountDue"] as const).map(key=><TextField key={key} label={labels[key]+" (CAD)"} value={value.fields[key]} maxLength={14} keyboardType="numbers-and-punctuation" editable={!disabled} onChangeText={v=>change(key,v)}/>)}
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>Subtotal is before tax and credits. Enter credits as a positive reduction. Leave a total blank if the statement does not show it.</Text>
   <TextField label="Period usage" value={value.fields.usage} maxLength={17} keyboardType="decimal-pad" editable={!disabled} onChangeText={v=>change("usage",v)}/>
   <View pointerEvents={disabled?"none":"auto"}>
    <CollectionFilter label="Usage unit" options={["","kWh","m³","GJ","L","Other"].map(v=>({value:v,label:v||"Not recorded"}))} selected={value.fields.unit} onSelect={v=>change("unit",v)}/>
    <CollectionFilter label="Reading type" options={["","actual","estimated","mixed","unknown"].map(v=>({value:v,label:v||"Not recorded"}))} selected={value.fields.reading} onSelect={v=>change("reading",v)}/>
   </View>
   <TextField label="Plan" value={value.fields.ratePlan} maxLength={120} editable={!disabled} onChangeText={v=>change("ratePlan",v)}/>
   <DateField label="Discount ends" optional value={value.fields.discountEnds} onChange={v=>{if(!disabled)change("discountEnds",v);}}/>
   {error?<Text accessibilityRole="alert" style={[typography.meta,{color:colors.criticalForeground}]}>{error}</Text>:null}
   <QuietAction label="Done editing details" disabled={disabled||Boolean(error)} onPress={()=>setEditing(false)}/>
  </>:<>
   {(Object.keys(labels) as Array<keyof StatementEvidence>).filter(key=>value.fields[key]).map(key=><View key={key} style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:8}}>
    <Text style={[typography.meta,{color:colors.mutedForeground}]}>{labels[key]}</Text>
    <Text style={[typography.meta,{color:colors.foreground,fontWeight:"600"}]}>{["subtotal","tax","credits","previousBalance","amountDue"].includes(key)?new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(Number(value.fields[key])):value.fields[key]}</Text>
   </View>)}
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:20}}><QuietAction label="Edit these details" disabled={disabled} onPress={()=>setEditing(true)}/>{Object.keys(value.quotes).length?<QuietAction label={sources?"Hide source excerpts":"Source excerpts"} disabled={disabled} onPress={()=>setSources(v=>!v)}/>:null}</View>
   {sources?Object.entries(value.quotes).map(([key,quote])=><Text key={key} style={[typography.caption,{color:colors.mutedForeground}]}>{labels[key as keyof StatementEvidence]}: “{quote}”</Text>):null}
  </>}
 </View>;
}
