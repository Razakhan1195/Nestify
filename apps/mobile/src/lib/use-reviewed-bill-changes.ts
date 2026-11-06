import {useEffect,useRef,useState} from "react";
import * as SecureStore from "expo-secure-store";

type ReviewState={scope:string|null;keys:string[];ready:boolean;busy:boolean;error:boolean;undo:string|null};
const empty:ReviewState={scope:null,keys:[],ready:false,busy:false,error:false,undo:null};
/** Device-local presentation state, scoped to the signed-in user and home. */
export function useReviewedBillChanges(userId:string|null,homeId:string) {
 const scope=userId?"rezlee.bill-reviews.v1."+userId+"."+homeId:null;
 const active=useRef<string|null>(null),lock=useRef(false);
 const failedAction=useRef<{scope:string;key:string;remove:boolean}|null>(null);
 const [saved,setSaved]=useState<ReviewState>(empty),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let live=true;active.current=scope;
  if(failedAction.current?.scope!==scope)failedAction.current=null;
  if(scope)void SecureStore.getItemAsync(scope).then(text=>{
   if(!live)return;let keys:string[]=[];
   try{const value=JSON.parse(text??"[]");if(Array.isArray(value))keys=value.filter((v):v is string=>typeof v==="string"&&v.length<120).slice(-12);}catch{/* Ignore malformed presentation state. */}
   setSaved({...empty,scope,keys,ready:true});
  }).catch(()=>{if(live)setSaved({...empty,scope,error:true});});
  return()=>{live=false;active.current=null;};
 },[scope,attempt]);
 const state=saved.scope===scope?saved:empty;
 async function write(key:string,remove=false){
  if(!scope||lock.current||!state.ready)return false;
  lock.current=true;setSaved(previous=>({...previous,busy:true,error:false}));
  const next=remove?state.keys.filter(v=>v!==key):[...state.keys.filter(v=>v!==key),key].slice(-12);
  try{await SecureStore.setItemAsync(scope,JSON.stringify(next));if(active.current!==scope)return false;failedAction.current=null;setSaved({...empty,scope,keys:next,ready:true,undo:remove?null:key});return true;}
  catch{if(active.current===scope){failedAction.current={scope,key,remove};setSaved(previous=>({...previous,busy:false,error:true}));}return false;}
  finally{lock.current=false;}
 }
 return {...state,retry:()=>{const failed=failedAction.current;if(failed?.scope===scope&&state.ready)void write(failed.key,failed.remove);else setAttempt(v=>v+1);},mark:(key:string)=>write(key),restore:()=>state.undo?write(state.undo,true):Promise.resolve()};
}
