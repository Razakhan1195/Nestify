import {Stack,useRouter} from "expo-router";
import {Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {NavigationButton} from "./NavigationButton";
import {safeBack} from "@/lib/navigation";
import {colors,layout,spacing,typography} from "@/theme/tokens";
export function ScreenNavigation({title,fallback,onBack,close=false,disabled=false,backLabel}:{title:string;fallback:string;onBack?:()=>void;close?:boolean;disabled?:boolean;backLabel?:string}){
 const router=useRouter();
 return <Stack.Screen options={{headerShown:true,title,headerShadowVisible:false,header:()=>
  <SafeAreaView edges={["top"]} style={{backgroundColor:colors.background}}><View style={{flexDirection:"row",alignItems:"center",paddingHorizontal:layout.screenHorizontal-spacing.md,paddingVertical:spacing.xs,gap:spacing.xs}}>
   <NavigationButton onPress={onBack??(()=>safeBack(router,fallback))} close={close} disabled={disabled} label={backLabel??(close?"Close":"Go back")}/>
   <Text accessibilityRole="header" style={[typography.section,{flex:1,color:colors.foreground,paddingRight:layout.touchMin}]}>{title}</Text>
  </View></SafeAreaView>
 }}/>
}
