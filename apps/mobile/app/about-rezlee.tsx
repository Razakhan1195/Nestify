import { useTheme } from "@/theme/useTheme";
import {ScrollView} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {FounderMessage} from "@/components/FounderWelcome";
import {Button} from "@/components/Button";

export default function AboutRezlee(){
  const { colors } = useTheme();
const router=useRouter();return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}><ScreenNavigation title="About Rezlee" fallback="/account"/><ScrollView contentContainerStyle={{padding:24,gap:28}}><FounderMessage/><Button label="Help shape the roadmap" onPress={()=>router.push("/roadmap")}/><Button label="Send private feedback" variant="secondary" onPress={()=>router.push("/feedback")}/></ScrollView></SafeAreaView>;}
