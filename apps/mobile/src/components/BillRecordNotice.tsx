import {useCallback,useState} from "react";
import {useFocusEffect,useRouter} from "expo-router";
import {View,Text} from "react-native";
import {QuietAction} from "./Brief";
import {apiGet} from "@/lib/api";
import {unresolvedBillCopies,type BillRecordPayload} from "@/lib/bill-record-review";
import {colors,spacing,typography} from "@/theme/tokens";
export function BillRecordNotice({billId}:{billId:string}){
 const router=useRouter();const [data,setData]=useState<BillRecordPayload|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 // Retry intentionally restarts this focused lookup without changing the bill.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useFocusEffect(useCallback(()=>{let active=true;setFailed(false);void apiGet<BillRecordPayload>("/api/mobile/v1/bills/"+billId+"/records",{timeoutMs:10000}).then(r=>{if(active)setData(r);},()=>{if(active)setFailed(true);});return()=>{active=false;};},[billId,retry]));
 if(failed)return <QuietAction label="Check statement records again" onPress={()=>setRetry(v=>v+1)}/>;
 if(!data?.enabled)return null;
 const copies=unresolvedBillCopies(data),changed=data.choices.some(c=>!c.current);
 return <View style={{gap:spacing.sm}}>
  {copies.length||changed?<Text style={[typography.body,{color:colors.mutedForeground}]}>{changed?"A record changed since your last choice. Check which version to count.":"Another saved record may cover this statement. Compare them before counting both."}</Text>:null}
  <QuietAction label={copies.length||changed?"Review statement copies":"Originals & changes"} onPress={()=>router.push({pathname:"/bill/records",params:{billId}})}/>
 </View>;
}
