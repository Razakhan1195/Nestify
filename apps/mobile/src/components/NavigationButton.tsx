import { useTheme } from "@/theme/useTheme";
import {Feather} from "@expo/vector-icons";
import {Pressable} from "react-native";
import { layout } from "@/theme/tokens";
export function NavigationButton({onPress,disabled=false,label="Go back",close=false}:{onPress:()=>void;disabled?:boolean;label?:string;close?:boolean}){
  const { colors } = useTheme();

 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} hitSlop={4} style={({pressed})=>({width:layout.touchMin,height:layout.touchMin,alignItems:"center",justifyContent:"center",opacity:disabled?0.4:pressed?0.55:1})}><Feather accessible={false} name={close?"x":"chevron-left"} size={close?22:26} color={colors.foreground}/></Pressable>;
}
