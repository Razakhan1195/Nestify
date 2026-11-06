import {useState} from "react";
import {Pressable,Text,View} from "react-native";
import {Feather} from "@expo/vector-icons";
import {Button} from "./Button";
import {QuietAction} from "./Brief";
import {Surface} from "./ui/Surface";
import {SharedSheet,sharedStyles as s} from "./SharedExpenseUI";
import {sharedPersonName,type SharedPayload,type SharedBalance} from "@/lib/shared-expenses";
import {sharedMoney} from "@/lib/shared-expense-math";
import {colors,typography} from "@/theme/tokens";

export function SharedBalances({data,ready,onSelect}:{data:SharedPayload;ready:boolean;onSelect:(pair:SharedBalance)=>void}){
 const [choosing,setChoosing]=useState(false),[expanded,setExpanded]=useState(false);
 const self=data.people.find(p=>p.self)?.id;
 const mine=data.balances.filter(p=>p.from===self||p.to===self),others=data.balances.filter(p=>p.from!==self&&p.to!==self);
 const owe=mine.filter(p=>p.from===self).reduce((n,p)=>n+p.cents,0),owed=mine.filter(p=>p.to===self).reduce((n,p)=>n+p.cents,0);
 const name=(id:string)=>sharedPersonName(data.people,id);
 const select=(pair:SharedBalance)=>{setChoosing(false);onSelect(pair);};
 function row(pair:SharedBalance){
  const outgoing=pair.from===self,incoming=pair.to===self,allowed=outgoing||incoming||data.role==="owner";
  const other=data.people.find(p=>p.id===(outgoing?pair.to:pair.from));
  const caption=outgoing?"You owe":incoming?"Owes you":name(pair.from)+" owes";
  const title=outgoing?name(pair.to):incoming?name(pair.from):name(pair.to);
  return <Pressable key={pair.from+pair.to} accessibilityRole={allowed?"button":undefined} accessibilityLabel={outgoing?"Settle with "+title+", you owe "+sharedMoney(pair.cents):incoming?"Record payment from "+title+", owes you "+sharedMoney(pair.cents):caption+" "+title+" "+sharedMoney(pair.cents)} disabled={!ready||!allowed} onPress={()=>select(pair)} style={({pressed})=>({paddingVertical:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:"row",gap:12,alignItems:"center",opacity:pressed?0.6:1})}>
   <View style={{width:40,height:40,borderRadius:20,backgroundColor:colors.accent,alignItems:"center",justifyContent:"center"}}><Feather name="user" size={19} color={colors.primary}/></View>
   <View style={{flex:1,gap:4}}><Text style={[s.body,{fontWeight:"600"}]}>{title}</Text><Text style={s.label}>{caption}{other&&!["owner","member"].includes(other.state)?" · Not joined":""}</Text></View>
   <Text style={[typography.section,{color:colors.foreground,fontVariant:["tabular-nums"]}]}>{sharedMoney(pair.cents)}</Text>{allowed?<Feather name="chevron-right" size={18} color={colors.primary}/>:null}
  </Pressable>;
 }
 return <>
  <Surface tone="subtle" style={{gap:20}}>
   <View style={{flexDirection:"row",gap:24,flexWrap:"wrap"}}>
    <View style={{gap:5,flexGrow:1}}><Text style={s.label}>You owe</Text><Text style={[typography.display,{color:colors.foreground,fontVariant:["tabular-nums"]}]}>{sharedMoney(owe)}</Text></View>
    <View style={{gap:5,flexGrow:1}}><Text style={s.label}>You’re owed</Text><Text style={[typography.display,{color:colors.foreground,fontVariant:["tabular-nums"]}]}>{sharedMoney(owed)}</Text></View>
   </View>
   {mine.length?<Button label="Settle up" disabled={!ready} onPress={()=>mine.length===1?select(mine[0]):setChoosing(true)}/>:<View style={{flexDirection:"row",gap:10,alignItems:"center"}}><Feather name="check-circle" size={22} color={colors.primary}/><Text style={s.body}>You’re settled up.</Text></View>}
   <Text style={s.label}>Based on recorded expenses and repayments.</Text>
  </Surface>
  {mine.length?<View><Text style={[typography.section,{color:colors.foreground}]}>Your balances</Text>{mine.map(row)}</View>:null}
  {others.length?<View style={{gap:6}}><QuietAction label={expanded?"Hide other balances":(data.groupId?"Other group balances (":"Other household balances (")+others.length+")"} onPress={()=>setExpanded(v=>!v)}/>{expanded?others.map(row):null}</View>:null}
  <SharedSheet title="Settle up" visible={choosing} onClose={()=>setChoosing(false)}>
   <Text style={s.label}>Choose a person. Record money already sent or received.</Text>{mine.map(row)}
  </SharedSheet>
 </>;
}
