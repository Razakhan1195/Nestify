import {useCallback,useLayoutEffect,useRef,useState} from "react";
import {ActivityIndicator,FlatList,Keyboard,Pressable,Text,View,useWindowDimensions} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect,useLocalSearchParams,useRouter} from "expo-router";
import {Feather} from "@expo/vector-icons";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {TextField} from "@/components/TextField";
import {Button} from "@/components/Button";
import {ApiError,apiGet} from "@/lib/api";
import {formatVaultDate} from "@/lib/vault-data";
import {colors,layout,spacing,typography} from "@/theme/tokens";
type ViewKind="documents"|"items"|"warranties";
type Cursor={time:string;id:string;kind:"document"|"item"};
type Entry={id:string;kind:"document"|"item";title:string;detail:string;expires:string|null;created_at:string};
type Page={rows:Entry[];total:number;nextCursor:Cursor|null;needsOnboarding?:boolean};
const choices=[{key:"documents",label:"Records"},{key:"items",label:"Home items"},{key:"warranties",label:"Warranties"}] as const;
export default function VaultSearchScreen(){
 const {fontScale}=useWindowDimensions();
 const params=useLocalSearchParams<{view?:string}>(),router=useRouter(),{session}=useAuth(),userId=session?.user.id;
 const [view,setView]=useState<ViewKind>(params.view==="items"||params.view==="warranties"?params.view:"documents"),[query,setQuery]=useState("");
 const [rows,setRows]=useState<Entry[]>([]),[page,setPage]=useState<Page|null>(null),[resultKey,setResultKey]=useState("");
 const [loading,setLoading]=useState(true),[more,setMore]=useState(false),[error,setError]=useState<string|null>(null),[failedCursor,setFailedCursor]=useState<Cursor|null>(null);
 const key=JSON.stringify([userId,view,query.trim()]),currentKey=useRef(key),generation=useRef(0),paging=useRef(false),list=useRef<FlatList<Entry>>(null);
 useLayoutEffect(()=>{currentKey.current=key;},[key]);
 const load=useCallback(async(cursor:Cursor|null=null)=>{
  if(!userId||cursor&&paging.current)return;
  if(cursor){paging.current=true;setMore(true);}else{paging.current=false;setLoading(true);list.current?.scrollToOffset({offset:0,animated:false});}
  const run=++generation.current;setError(null);setFailedCursor(null);
  try{
   const url="/api/mobile/v1/vault/search?view="+view+"&q="+encodeURIComponent(query.trim())+(cursor?"&cursor="+encodeURIComponent(JSON.stringify(cursor)):"");
   const data=await apiGet<Page>(url,{expectedUserId:userId,timeoutMs:20000});
   if(run!==generation.current||currentKey.current!==key)return;
   if(data.needsOnboarding){router.replace("/onboarding");return;}
   setRows(previous=>cursor?[...new Map([...previous,...data.rows].map(row=>[row.kind+":"+row.id,row])).values()]:data.rows);
   setPage(data);setResultKey(key);
  }catch(e){if(run===generation.current&&currentKey.current===key){setFailedCursor(cursor);setError(e instanceof ApiError?e.message:"Could not search your saved entries. Try again.");}}
  finally{if(run===generation.current&&currentKey.current===key){setLoading(false);setMore(false);paging.current=false;}}
 },[key,query,view,userId,router]);
 useFocusEffect(useCallback(()=>{setRows([]);setPage(null);setError(null);setLoading(true);setMore(false);paging.current=false;const timer=setTimeout(()=>void load(),query.trim()?300:0);return()=>{clearTimeout(timer);generation.current++;};},[load,query]));
 const current=resultKey===key,visible=current?rows:[];
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.canvas}}>
  <ScreenNavigation title="Find in Vault" fallback="/(tabs)/vault"/>
  <View style={{paddingHorizontal:layout.screenHorizontal,paddingTop:spacing.md,gap:12,paddingBottom:12}}>
   <View style={{flexDirection:fontScale>1.3?"column":"row",gap:6}}>{choices.map(choice=><Pressable key={choice.key} accessibilityRole="tab" accessibilityState={{selected:view===choice.key}} onPress={()=>{Keyboard.dismiss();setView(choice.key);}} style={{flex:fontScale>1.3?undefined:1,minHeight:48,paddingHorizontal:8,paddingVertical:10,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:view===choice.key?colors.secondary:colors.canvas}}><Text style={[typography.meta,{color:colors.foreground}]}>{choice.label}</Text></Pressable>)}</View>
   <TextField label={view==="documents"?"Search all records":view==="items"?"Search all home items":"Search all warranties"} placeholder={view==="items"?"Name, brand, model or room":"Name or recorded details"} value={query} onChangeText={setQuery} maxLength={100} returnKeyType="search" onSubmitEditing={()=>Keyboard.dismiss()} autoCorrect={false}/>
   {current&&!loading?<Text accessibilityLiveRegion="polite" style={[typography.caption,{color:colors.mutedForeground}]}>{page?.total??0} matching {(page?.total??0)===1?"entry":"entries"} · {visible.length} loaded</Text>:null}
  </View>
  {loading?<View style={{padding:24}}><ActivityIndicator color={colors.primary}/><Text style={[typography.meta,{textAlign:"center",marginTop:12,color:colors.mutedForeground}]}>Checking your saved entries…</Text></View>:null}
  {error?<View style={{paddingHorizontal:layout.screenHorizontal,gap:12,paddingBottom:12}}><Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text><Button label={failedCursor?"Try loading more again":"Try again"} variant="secondary" onPress={()=>void load(failedCursor)}/></View>:null}
  <FlatList ref={list} data={visible} keyExtractor={entry=>entry.kind+":"+entry.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshing={loading&&current} onRefresh={()=>void load()} initialNumToRender={12} contentContainerStyle={{paddingHorizontal:layout.screenHorizontal,paddingBottom:spacing["4xl"]}}
   ListEmptyComponent={!loading&&!error?<View style={{paddingVertical:28,gap:10}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{query.trim()?"No matching entries":"Nothing saved here yet"}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{query.trim()?"Try a shorter name, or clear your search to browse everything.":"Your saved records and home items will appear here."}</Text></View>:null}
   renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>{Keyboard.dismiss();router.push({pathname:item.kind==="document"?"/vault-record":"/inventory-item",params:{id:item.id}});}} style={{minHeight:76,paddingVertical:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
    <Feather name={item.kind==="item"?"box":"file-text"} size={19} color={colors.foreground}/><View style={{flex:1,gap:4}}><Text style={[typography.body,{color:colors.foreground,fontWeight:"600"}]} numberOfLines={2}>{item.title}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]} numberOfLines={2}>{item.detail}</Text>{item.expires?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{item.kind==="item"?"Coverage date":"Recorded expiry"}: {formatVaultDate(item.expires)}</Text>:null}</View><Feather name="chevron-right" size={17} color={colors.mutedForeground}/>
   </Pressable>}
   ListFooterComponent={current&&page?.nextCursor?<View style={{paddingTop:20}}><Button label="Load more" variant="secondary" loading={more} disabled={loading} onPress={()=>void load(page.nextCursor)}/></View>:null}/>
 </SafeAreaView>;
}
