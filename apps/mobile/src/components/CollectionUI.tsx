import { useTheme } from "@/theme/useTheme";
import { useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { editorialType, layout, radii, spacing, typography } from "@/theme/tokens";

export function CollectionToolbar({ title, description, label, onAdd }: { title?:string; description: string; label?: string; onAdd?: () => void }) {
  const { colors } = useTheme();

 return <View style={{gap:spacing.sm}}>
  <View style={{flexDirection:"row",alignItems:"center",gap:spacing.md}}>
   {title?<Text accessibilityRole="header" style={[editorialType,{fontSize:34,lineHeight:41,color:colors.foreground,flex:1}]}>{title}</Text>:<Text style={[typography.body,{color:colors.mutedForeground,flex:1}]}>{description}</Text>}
   {onAdd?<Pressable accessibilityRole="button" accessibilityLabel={label??"Add"} onPress={onAdd} style={({pressed})=>({minHeight:48,paddingHorizontal:18,paddingVertical:12,borderRadius:radii.lg,backgroundColor:colors.primary,flexDirection:"row",alignItems:"center",gap:6,opacity:pressed?0.7:1})}>
    <Feather accessible={false} name="plus" size={18} color={colors.primaryForeground}/><Text style={[typography.body,{fontWeight:"600",color:colors.primaryForeground}]}>Add</Text>
   </Pressable>:null}
  </View>
  {title?<Text style={[typography.body,{color:colors.mutedForeground}]}>{description}</Text>:null}
 </View>;
}

type AddChoice = { key: string; title: string; detail: string; icon: keyof typeof Feather.glyphMap; onPress: () => void };
export function CollectionAddSheet({ title, visible, onClose, choices }: { title: string; visible: boolean; onClose: () => void; choices: AddChoice[] }) {
  const { colors } = useTheme();

 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <View style={{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,0.3)"}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Close add menu" onPress={onClose} style={{flex:1}}/>
   <SafeAreaView edges={["bottom"]} style={{maxHeight:"85%",backgroundColor:colors.background,borderTopLeftRadius:radii["3xl"],borderTopRightRadius:radii["3xl"]}}>
    <ScrollView keyboardDismissMode="on-drag" accessibilityViewIsModal contentContainerStyle={{padding:spacing.xl}} keyboardShouldPersistTaps="handled">
     <View style={{flexDirection:"row",alignItems:"center",gap:spacing.md}}>
      <Text accessibilityRole="header" style={[typography.title,{color:colors.foreground,flex:1}]}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather accessible={false} name="x" size={22} color={colors.foreground}/></Pressable>
     </View>
     {choices.map(choice=><Pressable key={choice.key} accessibilityRole="button" onPress={()=>{onClose();choice.onPress();}} style={({pressed})=>({minHeight:72,paddingVertical:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:"row",alignItems:"center",gap:14,opacity:pressed?0.6:1})}>
      <Feather accessible={false} name={choice.icon} size={21} color={colors.primary}/>
      <View style={{flex:1,gap:4}}><Text style={[typography.body,{color:colors.foreground,fontWeight:"600"}]}>{choice.title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{choice.detail}</Text></View>
      <Feather accessible={false} name="chevron-right" size={17} color={colors.mutedForeground}/>
     </Pressable>)}
    </ScrollView>
   </SafeAreaView>
  </View>
 </Modal>;
}

export function CollectionSearch({value,onChangeText,placeholder,label}:{value:string;onChangeText:(value:string)=>void;placeholder:string;label:string}) {
  const { colors , mode: useThemeMode } = useTheme();

 const input=useRef<TextInput>(null);
 const [focused,setFocused]=useState(false);
 return <View style={{flexDirection:"row",alignItems:"center",gap:10,paddingLeft:14,paddingRight:4,borderWidth:1,borderColor:focused?colors.primary:colors.border,borderRadius:radii.lg,backgroundColor:colors.surfaceRaised}}>
  <Feather accessible={false} name="search" size={18} color={colors.mutedForeground}/>
  <TextInput keyboardAppearance={useThemeMode} selectionColor={colors.primary} ref={input} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} value={value} onChangeText={onChangeText} style={[typography.body,{flex:1,minHeight:48,paddingVertical:12,color:colors.foreground}]}/>
  {value?<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>{onChangeText("");input.current?.focus();}} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Feather accessible={false} name="x" size={18} color={colors.mutedForeground}/></Pressable>:<View style={{width:10}}/>}
 </View>;
}


/** Keep the collection identifiable while its first request is pending.
 * Static placeholders avoid shimmer and honour reduced-motion preferences. */
export function CollectionLoading({ title, description, label }: { title: string; description: string; label: string }) {
  const { colors } = useTheme();

 return <View style={{paddingHorizontal:layout.screenHorizontal,paddingTop:layout.screenTop,gap:layout.sectionGap}}>
  <CollectionToolbar title={title} description={description}/>
  <View accessible accessibilityLabel={label} accessibilityState={{busy:true}} style={{flexDirection:"row",alignItems:"center",gap:10}}>
   <ActivityIndicator accessible={false} color={colors.primary}/>
   <Text style={[typography.meta,{color:colors.mutedForeground,flex:1}]}>{label}</Text>
  </View>
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{gap:12}}>
   {[0,1,2].map(index=><View key={index} style={{padding:18,borderRadius:18,backgroundColor:colors.surface,gap:12}}>
    <View style={{height:12,width:index===1?"52%":"66%",borderRadius:6,backgroundColor:colors.surfaceSubtle}}/>
    <View style={{height:10,width:"38%",borderRadius:5,backgroundColor:colors.muted}}/>
   </View>)}
  </View>
 </View>;
}
