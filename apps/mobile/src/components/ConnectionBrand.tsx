import {useState} from "react";
import {Image,Text,View} from "react-native";
import {colors,typography} from "@/theme/tokens";
/* eslint-disable @typescript-eslint/no-require-imports */
const logos={deck:require("../../assets/providers/deck.png"),green:require("../../assets/providers/green-button.png")};
/* eslint-enable @typescript-eslint/no-require-imports */
export function ConnectionBrand({kind,compact=false}:{kind:"deck"|"green";compact?:boolean}) {
 const [failed,setFailed]=useState(false);
 return <View style={{minHeight:compact?32:62,justifyContent:"center",alignItems:"flex-start"}}>
  {failed?<Text style={[typography.section,{color:colors.foreground}]}>{kind==="deck"?"Deck":"Green Button"}</Text>:
   <Image source={logos[kind]} alt={kind==="deck"?"Deck":"Green Button Connect My Data"} accessibilityLabel={kind==="deck"?"Deck":"Green Button Connect My Data"} resizeMode="contain" onError={()=>setFailed(true)} style={{width:kind==="deck"?(compact?78:104):(compact?118:148),height:kind==="deck"?(compact?24:34):(compact?42:62)}}/>}
 </View>;
}
