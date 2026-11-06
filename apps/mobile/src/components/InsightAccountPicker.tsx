import {Feather} from "@expo/vector-icons";
import {useState} from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import {SafeAreaView} from "react-native-safe-area-context";
import {ProviderBrand} from "./ProviderBrand";
import {TextField} from "./TextField";
import {accountServiceLabel} from "@/lib/saved-bill-story";
import type {BillAccountOverview} from "@/lib/bill-account-overview";
import {colors,typography} from "@/theme/tokens";

export function InsightAccountPicker({accounts,selected,onSelect}:{accounts:BillAccountOverview[];selected:string|null;onSelect:(key:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState("");
 const current=accounts.find(account=>account.key===selected);
 const base=(account:BillAccountOverview)=>[accountServiceLabel(account.category),account.accountLabel].filter(Boolean).join(" · ");
 const context=(account:BillAccountOverview)=>[base(account),...(accounts.filter(other=>other.provider===account.provider&&base(other)===base(account)).length>1?[account.sourceLabel,account.currency]:[])].filter(Boolean).join(" · ");
 const visible=accounts.filter(account=>[account.provider,context(account)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 function close(){setOpen(false);setQuery("");}
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel={current?"Change insights account. "+current.provider+". "+context(current):"Choose an account for insights"} accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} style={({pressed})=>({backgroundColor:pressed?colors.surfaceSubtle:colors.surfaceRaised,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:16,gap:9})}>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>Insights for</Text>
   <View style={{flexDirection:"row",alignItems:"center",gap:12}}><View style={{flex:1,gap:6}}>{current?<><ProviderBrand provider={current.provider} category={current.categoryId} identity compact/>{context(current)?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{context(current)}</Text>:null}</>:<Text style={[typography.section,{color:colors.foreground}]}>Choose an account</Text>}</View><View style={{width:32,height:32,borderRadius:16,backgroundColor:colors.surfaceSubtle,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-down" size={18} color={colors.primary}/></View></View>
  </Pressable>
  <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
   <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1,backgroundColor:"rgba(0,0,0,0.3)",justifyContent:"flex-end"}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close account selector" onPress={close} style={{flex:1}}/>
    <SafeAreaView edges={["bottom"]} style={{maxHeight:"85%",backgroundColor:colors.background,borderTopLeftRadius:24,borderTopRightRadius:24}}>
     <ScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:16}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text accessibilityRole="header" style={[typography.title,{flex:1,color:colors.foreground}]}>Choose an account</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Feather name="x" size={22} color={colors.foreground}/></Pressable></View>
      <Text style={[typography.meta,{color:colors.mutedForeground}]}>Each account has its own bill history and insights.</Text>
      {accounts.length>6?<TextField label="Find an account" placeholder="Provider or account name" value={query} onChangeText={setQuery} autoCorrect={false}/>:null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Bill accounts" style={{gap:8}}>{visible.map(account=><Pressable key={account.key} accessibilityRole="radio" accessibilityLabel={account.provider+". "+context(account)} accessibilityState={{checked:account.key===selected}} onPress={()=>{onSelect(account.key);close();}} style={({pressed})=>({minHeight:76,padding:16,borderRadius:14,backgroundColor:account.key===selected?colors.surfaceSubtle:pressed?colors.muted:colors.surfaceRaised,flexDirection:"row",alignItems:"center",gap:12})}><View style={{flex:1,gap:6}}><ProviderBrand provider={account.provider} category={account.categoryId} identity compact/>{context(account)?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{context(account)}</Text>:null}</View>{account.key===selected?<Feather name="check-circle" size={21} color={colors.primary}/>:<View style={{width:21}}/>}</Pressable>)}</View>
      {!visible.length?<Text style={[typography.body,{color:colors.mutedForeground}]}>{accounts.length?"No matching accounts. Try another name.":"No accounts available."}</Text>:null}
     </ScrollView>
    </SafeAreaView>
   </KeyboardAvoidingView>
  </Modal>
 </>;
}
