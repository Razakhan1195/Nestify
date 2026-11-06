import {ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {colors, editorialType, premium, typography} from '@/theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles native image assets through static require.
const brandMark = require('../../assets/brand-mark.png');

/** A real invitation, rendered natively. Text remains selectable and scales with the phone. */
export function ReferralPass({code, loading}: {code: string | null; loading: boolean}) {
 const {width, fontScale} = useWindowDimensions();
 const compact = width < 360 || fontScale > 1.2;
 return <View style={styles.paper}>
  <View style={styles.pass}>
   <View style={styles.brandRow}>
    <View style={styles.brand}>
     <Image alt="" accessible={false} source={brandMark} style={styles.mark}/>
     <Text style={styles.wordmark}>rezlee</Text>
    </View>
    <Text style={styles.eyebrow}>A GIFT FOR A FRIEND</Text>
   </View>
   <View style={styles.value}>
    <Text accessibilityRole="header" style={styles.product}>Rezlee Pro</Text>
    <Text style={styles.duration}>One month, on us.</Text>
   </View>
   <View style={[styles.codeRow, compact && styles.codeStack]}>
    <View style={styles.codeLabel}>
     <Text style={styles.eyebrow}>YOUR INVITATION</Text>
     <Text style={styles.codeHint}>Share it with someone you know.</Text>
    </View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading your invitation code" color={premium.onInk}/> :
     <Text selectable accessibilityLabel={code ? 'Invitation code '+code.split('').join(' ') : 'Invitation code unavailable'} style={styles.code}>{code ? code.match(/.{1,4}/g)?.join(' ') : 'Not available yet'}</Text>}
   </View>
  </View>
  <View style={styles.footer}><View style={styles.dot}/><Text style={styles.footerText}>No card needed. No automatic renewal.</Text></View>
 </View>;
}
const styles = StyleSheet.create({
 paper: {backgroundColor:colors.secondary, borderRadius:22, padding:5},
 pass: {backgroundColor:premium.ink, borderRadius:18, padding:22, gap:30},
 brandRow: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap'},
 brand: {flexDirection:'row', alignItems:'center', gap:7},
 mark: {width:23, height:26, resizeMode:'contain', tintColor:premium.onInk},
 wordmark: {fontSize:22, lineHeight:28, letterSpacing:-0.8, fontWeight:'600', color:premium.onInk},
 eyebrow: {...typography.label, color:premium.onInkMuted, fontSize:10, lineHeight:15, letterSpacing:1},
 value: {gap:6},
 product: {...editorialType, fontSize:38, lineHeight:46, color:premium.onInk},
 duration: {...typography.body, color:premium.onInkMuted},
 codeRow: {borderTopWidth:1, borderTopColor:'rgba(255,253,246,0.22)', paddingTop:17, gap:12},
 codeStack: {gap:10},
 codeLabel: {gap:3},
 codeHint: {...typography.meta, color:premium.onInkMuted},
 code: {fontSize:19, lineHeight:28, letterSpacing:2, color:premium.onInk, fontWeight:'500', flexShrink:1},
 footer: {flexDirection:'row', alignItems:'center', justifyContent:'center', paddingHorizontal:12, paddingVertical:13, gap:7},
 dot: {width:5, height:5, borderRadius:3, backgroundColor:colors.primary},
 footerText: {...typography.caption, lineHeight:17, color:colors.secondaryForeground, flexShrink:1},
});
