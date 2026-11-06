import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type Props = { label: string; value: string; onChange: (value: string) => void; optional?: boolean; disabled?: boolean; placeholder?: string };
const months = Array.from({length:12},(_,i)=>new Intl.DateTimeFormat("en-CA",{month:"long"}).format(new Date(2024,i,1)));
const weekdays = ["S","M","T","W","T","F","S"];
function parseDate(value: string) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const [y,m,d]=value.split("-").map(Number), date=new Date(y,m-1,d);
 return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d ? date : null;
}
function iso(date: Date) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-"); }
function display(date: Date) { return new Intl.DateTimeFormat("en-CA",{day:"numeric",month:"long",year:"numeric"}).format(date); }

export function DateField({label,value,onChange,optional=false,disabled=false,placeholder="Choose a date"}:Props) {
 const insets=useSafeAreaInsets(),selected=parseDate(value);
 const [open,setOpen]=useState(false),[month,setMonth]=useState(selected??new Date());
 const [mode,setMode]=useState<"days"|"months"|"years">("days"),[yearStart,setYearStart]=useState(2020);
 const days=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1);return Array.from({length:42},(_,i)=>new Date(first.getFullYear(),first.getMonth(),1-first.getDay()+i));},[month]);
 function choose(date:Date){if(disabled)return;onChange(iso(date));setOpen(false);}
 function begin(){if(disabled)return;Keyboard.dismiss();const start=selected??new Date();setMonth(start);setYearStart(Math.floor(start.getFullYear()/12)*12);setMode("days");setOpen(true);}
 const cell=(active=false)=>({minHeight:44,alignItems:"center" as const,justifyContent:"center" as const,borderRadius:radii.md,backgroundColor:active?colors.primary:colors.secondary});
 const text=(active=false)=>({fontSize:15,fontWeight:"600" as const,color:active?colors.primaryForeground:colors.foreground});
 function page(delta:number){if(mode==="years")setYearStart(v=>Math.max(100,Math.min(9988,v+delta*12)));else setMonth(v=>new Date(v.getFullYear()+(mode==="months"?delta:0),v.getMonth()+(mode==="days"?delta:0),1));}
 return <View style={{gap:6}}>
  <Text style={{fontSize:13,fontWeight:"600",color:colors.mutedForeground}}>{label}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label+(selected?", "+display(selected):"")} accessibilityState={{disabled}} disabled={disabled} onPress={begin}
   style={{minHeight:48,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radii.md,backgroundColor:colors.card,flexDirection:"row",alignItems:"center",gap:12}}>
   <Text style={{flex:1,fontSize:16,color:selected?colors.foreground:colors.mutedForeground}}>{selected?display(selected):placeholder}</Text><Feather name="calendar" size={18} color={colors.mutedForeground}/>
  </Pressable>
  <Modal visible={open&&!disabled} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(34,48,43,0.35)"}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel date selection" onPress={()=>setOpen(false)} style={{position:"absolute",inset:0}}/>
    <View accessibilityViewIsModal style={{maxHeight:"90%",backgroundColor:colors.surfaceRaised,borderTopLeftRadius:28,borderTopRightRadius:28,paddingBottom:Math.max(insets.bottom,16)}}>
     <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
       <View style={{flex:1,gap:4}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{label}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{selected?display(selected):"No date selected"}</Text></View>
       <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={()=>setOpen(false)} style={[cell(),{width:44}]}><Feather name="x" size={20} color={colors.primary}/></Pressable>
      </View>
      <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
       <Pressable accessibilityRole="button" accessibilityLabel={mode==="years"?"Previous 12 years":mode==="months"?"Previous year":"Previous month"} onPress={()=>page(-1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-left" size={20} color={colors.primary}/></Pressable>
       {mode==="years"?<Text accessibilityLiveRegion="polite" style={[text(),{flex:1,textAlign:"center"}]}>{yearStart}–{yearStart+11}</Text>:<>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose month" onPress={()=>setMode("months")} style={[cell(),{flex:1,paddingHorizontal:8}]}><Text style={text()}>{months[month.getMonth()]}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose year" onPress={()=>{setYearStart(Math.floor(month.getFullYear()/12)*12);setMode("years");}} style={[cell(),{paddingHorizontal:12}]}><Text style={text()}>{month.getFullYear()} ▾</Text></Pressable>
       </>}
       <Pressable accessibilityRole="button" accessibilityLabel={mode==="years"?"Next 12 years":mode==="months"?"Next year":"Next month"} onPress={()=>page(1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-right" size={20} color={colors.primary}/></Pressable>
      </View>
      {mode==="years"?<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
       {Array.from({length:12},(_,i)=>yearStart+i).map(year=><Pressable key={year} accessibilityRole="button" accessibilityLabel={String(year)} accessibilityState={{selected:month.getFullYear()===year}} onPress={()=>{setMonth(new Date(year,month.getMonth(),1));setMode("months");}} style={[cell(month.getFullYear()===year),{width:"30%",flexGrow:1,minHeight:52}]}><Text style={text(month.getFullYear()===year)}>{year}</Text></Pressable>)}
      </View>:mode==="months"?<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
       {months.map((name,index)=><Pressable key={name} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{selected:month.getMonth()===index}} onPress={()=>{setMonth(new Date(month.getFullYear(),index,1));setMode("days");}} style={[cell(month.getMonth()===index),{width:"30%",flexGrow:1,minHeight:52}]}><Text style={text(month.getMonth()===index)}>{name.slice(0,3)}</Text></Pressable>)}
      </View>:<View>
       <View style={{flexDirection:"row"}}>{weekdays.map((day,i)=><Text key={i} style={{width:"14.2857%",textAlign:"center",paddingVertical:8,color:colors.mutedForeground}}>{day}</Text>)}</View>
       <View style={{flexDirection:"row",flexWrap:"wrap"}}>{days.map(date=><Pressable key={iso(date)} accessibilityRole="button" accessibilityLabel={display(date)} accessibilityState={{selected:iso(date)===value}} onPress={()=>choose(date)} style={{width:"14.2857%",minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:radii.full,backgroundColor:iso(date)===value?colors.primary:"transparent",opacity:date.getMonth()===month.getMonth()?1:0.5}}><Text style={text(iso(date)===value)}>{date.getDate()}</Text></Pressable>)}</View>
      </View>}
      {mode!=="days"?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Choose {mode==="years"?"a year, then a month and day":"a month, then a day"}. Your date changes only when you choose a day.</Text>:null}
      <View style={{flexDirection:"row",gap:8}}>
       <Pressable accessibilityRole="button" onPress={()=>choose(new Date())} style={[cell(),{flex:1}]}><Text style={text()}>Today</Text></Pressable>
       {optional?<Pressable accessibilityRole="button" onPress={()=>{onChange("");setOpen(false);}} style={[cell(),{flex:1}]}><Text style={text()}>Clear</Text></Pressable>:null}
      </View>
     </ScrollView>
    </View>
   </View>
  </Modal>
 </View>;
}
