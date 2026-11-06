import {Feather} from "@expo/vector-icons";
import {Image,Pressable,Text,View,useWindowDimensions} from "react-native";
import {marks} from "./WelcomeArtwork";
import {colors,homeTile,typography} from "@/theme/tokens";

type Artwork="bills"|"records"|"care"|"shared";
const paper={backgroundColor:colors.surfaceRaised,borderRadius:9,shadowColor:"#18392B",shadowOffset:{width:0,height:5},shadowOpacity:.12,shadowRadius:9,elevation:2} as const;
function Line({width=48}:{width?:number}){return <View style={{height:3,width,backgroundColor:"#D9DFD5",borderRadius:2}}/>;}
/** Decorative product scenes, not saved balances, dates or verified coverage. */
function TileArtwork({kind}:{kind:Artwork}){
 return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:128,height:116,justifyContent:"center",alignItems:"center"}}>
 <View style={{position:"absolute",width:112,height:112,borderRadius:56,backgroundColor:"#FFFFFF55"}}/>
 {kind==="shared"?<>
 <View style={[paper,{width:94,height:71,top:5,left:12,position:"absolute",padding:12,transform:[{rotate:"-5deg"}],gap:7}]}><Text allowFontScaling={false} style={{fontSize:10,color:colors.foreground,fontWeight:"600"}}>Household shop</Text><Line width={59}/><Line width={39}/></View>
 <View style={[paper,{position:"absolute",left:5,right:0,bottom:6,padding:9,flexDirection:"row",justifyContent:"space-between",alignItems:"center"}]}>{["#D6E4D4","#ECDDBE","#D6E4EB"].map((tone,i)=><View key={tone} style={{alignItems:"center",gap:4}}><View style={{width:24,height:24,borderRadius:12,backgroundColor:tone,alignItems:"center",justifyContent:"center"}}><Feather name="user" size={13} color={colors.primary}/></View><Text allowFontScaling={false} style={{fontSize:8,color:colors.primary,fontWeight:"600"}}>{i===0?"Paid":"Share"}</Text></View>)}</View>
 </>:kind==="care"?<>
 <View style={[paper,{width:65,height:85,position:"absolute",left:3,top:9,transform:[{rotate:"-6deg"}],overflow:"hidden"}]}><View style={{height:17,backgroundColor:colors.primary}}/><View style={{padding:9,gap:9}}><View style={{flexDirection:"row",gap:5}}>{[0,1,2].map(n=><View key={n} style={{width:9,height:9,borderRadius:3,backgroundColor:colors.accent}}/>)}</View><Feather name="check" size={31} color={colors.primary}/></View></View>
 <View style={[paper,{position:"absolute",right:0,bottom:7,width:87,padding:10,gap:8,transform:[{rotate:"4deg"}]}]}><Text allowFontScaling={false} style={{fontSize:9,fontWeight:"600",color:colors.foreground}}>Filter reminder</Text>{[0,1].map(n=><View key={n} style={{flexDirection:"row",gap:5,alignItems:"center"}}><Feather name={n?"circle":"check-circle"} size={10} color={colors.primary}/><Line width={n?30:43}/></View>)}</View>
 </>:<>
 <View style={[paper,{position:"absolute",left:0,top:7,width:79,height:92,padding:9,transform:[{rotate:"-8deg"}],gap:8}]}><Image alt="" source={kind==="bills"?marks.enbridge:marks.tire} resizeMode="contain" style={{width:61,height:27}}/><Line width={51}/><Line width={38}/><Text allowFontScaling={false} style={{fontSize:8,color:colors.mutedForeground}}>{kind==="bills"?"Statement":"Receipt"}</Text></View>
 <View style={[paper,{position:"absolute",right:0,top:24,width:71,height:85,padding:9,transform:[{rotate:"6deg"}],gap:7}]}><Image alt="" source={kind==="bills"?marks.elexicon:marks.depot} resizeMode="contain" style={{width:kind==="bills"?32:29,height:30}}/><Line width={44}/><Line width={30}/></View>
 <View style={{position:"absolute",bottom:0,left:38,backgroundColor:colors.primary,paddingHorizontal:9,paddingVertical:5,borderRadius:12,flexDirection:"row",gap:4,alignItems:"center"}}><Feather name={kind==="bills"?"bar-chart-2":"check"} size={11} color={colors.primaryForeground}/><Text allowFontScaling={false} style={{fontSize:8,color:colors.primaryForeground,fontWeight:"600"}}>{kind==="bills"?"See the change":"Easy to find"}</Text></View>
 </>}
 </View>;
}
export function HomeFeatureTile({title,detail,action,artwork,backgroundColor,onPress}:{title:string;detail:string;action:string;artwork:Artwork;backgroundColor:string;onPress:()=>void}){
 const {fontScale,width}=useWindowDimensions(),stack=fontScale>1.3||width<360;
 return <Pressable accessibilityRole="button" accessibilityLabel={title+". "+detail+" "+action} onPress={onPress} style={({pressed})=>({padding:homeTile.padding,borderRadius:homeTile.radius,gap:16,backgroundColor,borderWidth:1,borderColor:"#264D3E0D",opacity:pressed?.85:1})}>
 <View style={{flexDirection:stack?"column":"row",gap:14,alignItems:stack?"flex-start":"center"}}>
 <View style={{flex:stack?undefined:1,gap:9}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{detail}</Text></View>
 <TileArtwork kind={artwork}/>
 </View>
 <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,alignSelf:"flex-start",minHeight:38,paddingVertical:8,paddingHorizontal:13,borderRadius:12,backgroundColor:"#FFFDF8B8",borderWidth:1,borderColor:"#264D3E12"}}><Text style={[typography.meta,{color:colors.primary,fontWeight:"600",flexShrink:1}]}>{action}</Text><Feather name="arrow-right" size={17} color={colors.primary}/></View>
 </Pressable>;
}
