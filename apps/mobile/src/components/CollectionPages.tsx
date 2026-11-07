import { useTheme } from "@/theme/useTheme";
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import {SafeAreaView} from "react-native-safe-area-context";
import {Feather} from "@expo/vector-icons";
import { layout, typography } from "@/theme/tokens";
import {collectionSwipeTarget,isCollectionSwipe} from "@/lib/collection-swipe";

type Option<T extends string>={value:T;label:string};
export function CollectionPages<T extends string>({options,selected,onSelect,label,renderPage}:{options:readonly Option<T>[];selected:T;onSelect:(value:T)=>void;label:string;renderPage:(value:T)=>ReactNode}){
  const { colors, selectionControl } = useTheme();

 const {width:windowWidth,fontScale}=useWindowDimensions();
 const vertical=fontScale>1.3;
 const [width,setWidth]=useState(Math.max(1,windowWidth-layout.screenHorizontal*2));
 const [reduced,setReduced]=useState(true);
 const [underline]=useState(()=>new Animated.Value(0));
 const [pageOffset]=useState(()=>new Animated.Value(0));
 const index=Math.max(0,options.findIndex(o=>o.value===selected));
 const previous=useRef(index);
 useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});const listener=AccessibilityInfo.addEventListener("reduceMotionChanged",setReduced);return()=>{active=false;listener.remove();};},[]);
 useLayoutEffect(()=>{
  const direction=Math.sign(index-previous.current);previous.current=index;
  underline.stopAnimation();pageOffset.stopAnimation();
  pageOffset.setValue(reduced?0:direction*18);
  if(reduced){underline.setValue(index*(width-selectionControl.inset*2)/options.length);return;}
  Animated.parallel([
   Animated.timing(underline,{toValue:index*(width-selectionControl.inset*2)/options.length,duration:180,useNativeDriver:true}),
   Animated.timing(pageOffset,{toValue:0,duration:180,useNativeDriver:true}),
  ]).start();
 },[index,width,reduced,options.length,underline,pageOffset,selectionControl.inset]);
 const gesture=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,state)=>isCollectionSwipe(state.dx,state.dy,state.numberActiveTouches),
  onPanResponderMove:(_,state)=>{if(!reduced)pageOffset.setValue(Math.max(-28,Math.min(28,state.dx*0.12)));},
  onPanResponderRelease:(_,state)=>{
   const next=collectionSwipeTarget(index,options.length,state.dx,state.dy,state.vx);
   if(next!==index)onSelect(options[next].value);
   if(reduced)pageOffset.setValue(0);else Animated.timing(pageOffset,{toValue:0,duration:160,useNativeDriver:true}).start();
  },
  onPanResponderTerminate:()=>pageOffset.setValue(0),
 }),[index,options,onSelect,reduced,pageOffset]);
 const tabWidth=(width-selectionControl.inset*2)/options.length;
 const indicatorWidth=Math.max(1,tabWidth);
 return <View style={{gap:20}} onLayout={event=>{const next=event.nativeEvent.layout.width;if(next>0&&Math.abs(next-width)>0.5)setWidth(next);}}>
  <View accessibilityRole="tablist" accessibilityLabel={label} style={{backgroundColor:selectionControl.background,borderRadius:16,padding:selectionControl.inset}}>
   {!vertical?<Animated.View accessible={false} style={{position:"absolute",top:4,bottom:4,left:4,width:indicatorWidth,borderRadius:14,backgroundColor:colors.surfaceRaised,transform:[{translateX:underline}]}}/>:null}
   <View style={{flexDirection:vertical?"column":"row",gap:vertical?selectionControl.gap:0}}>
    {options.map(option=><Pressable key={option.value} accessibilityRole="tab" accessibilityState={{selected:option.value===selected}} onPress={()=>onSelect(option.value)} style={({pressed})=>({flex:vertical?undefined:1,minHeight:selectionControl.minHeight,paddingHorizontal:12,paddingVertical:10,borderRadius:selectionControl.radius,backgroundColor:vertical&&option.value===selected?selectionControl.selectedBackground:undefined,justifyContent:"center",alignItems:vertical?"flex-start":"center",opacity:pressed?0.65:1})}><Text style={[typography.body,{fontWeight:"600",textAlign:vertical?"left":"center",color:option.value===selected?selectionControl.selectedText:selectionControl.text}]}>{option.label}</Text></Pressable>)}
   </View>
  </View>
  {/* Keep pages mounted for their filters/selection, but let the active page take its
      natural height. Measuring an empty pager previously trapped async content at 0. */}
  <View style={{overflow:"hidden"}} {...gesture.panHandlers}>
   <Animated.View style={{transform:[{translateX:pageOffset}]}}>
    {options.map(option=><View key={option.value} accessibilityElementsHidden={option.value!==selected} importantForAccessibility={option.value===selected?"auto":"no-hide-descendants"} style={{display:option.value===selected?"flex":"none"}}>{renderPage(option.value)}</View>)}
   </Animated.View>
  </View>
 </View>;
}
export function CollectionFilter<T extends string>({label,options,selected,onSelect}:{label:string;options:readonly Option<T>[];selected:T;onSelect:(value:T)=>void}){
  const { colors } = useTheme();

 const [open,setOpen]=useState(false);
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel={label+". "+(options.find(o=>o.value===selected)?.label??"Choose")} accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:6,paddingRight:12}}>
   <Text style={[typography.meta,{color:colors.primary,fontWeight:"600",flexShrink:1}]}>{options.find(o=>o.value===selected)?.label??"Choose"}</Text><Feather name="chevron-down" size={16} color={colors.primary}/>
  </Pressable>
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,backgroundColor:"#00000055",justifyContent:"flex-end"}}><Pressable accessibilityRole="button" accessibilityLabel="Close filters" style={{flex:1}} onPress={()=>setOpen(false)}/>
    <SafeAreaView edges={["bottom"]} style={{backgroundColor:colors.background,borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:"80%"}}>
     <ScrollView accessibilityViewIsModal contentContainerStyle={{padding:24}}>
      <View style={{flexDirection:"row",alignItems:"center"}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,flex:1}]}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={()=>setOpen(false)} style={{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}}><Feather name="x" size={22} color={colors.foreground}/></Pressable></View>
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>{options.map(option=><Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:selected===option.value}} onPress={()=>{onSelect(option.value);setOpen(false);}} style={{minHeight:52,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:12}}><Text style={[typography.body,{color:colors.foreground,flex:1}]}>{option.label}</Text>{selected===option.value?<Feather name="check" size={20} color={colors.primary}/>:null}</Pressable>)}</View>
     </ScrollView>
    </SafeAreaView>
   </View>
  </Modal>
 </>;
}

