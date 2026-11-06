import {FormScrollView} from "@/components/FormScrollView";
import {useCallback, useRef, useState} from 'react';
import {useFocusEffect, useRouter} from 'expo-router';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Feather} from '@expo/vector-icons';
import {useAuth} from '@/auth/AuthProvider';
import {ScreenNavigation} from '@/components/ScreenNavigation';
import {Button} from '@/components/Button';
import {TextField} from '@/components/TextField';
import {ReferralPass} from '@/components/ReferralPass';
import {apiGet, apiPost} from '@/lib/api';
import {loadMembership} from '@/lib/membership';
import {colors, editorialType, premium, typography} from '@/theme/tokens';

type Invitation = {code:string; url:string};
type ClaimResult = {status:'claimed'|'already_pro'|'not_new'; expiresAt?:string};

export default function Rewards() {
 const router = useRouter();
 const {session} = useAuth();
 const userId = session?.user.id;
 const [invite, setInvite] = useState<(Invitation & {ownerId:string})|null>(null);
 const visibleInvite = invite?.ownerId === userId ? invite : null;
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState('');
 const [shareError, setShareError] = useState('');
 const [sharing, setSharing] = useState(false);
 const [code, setCode] = useState('');
 const [claimOpen, setClaimOpen] = useState(false);
 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('');
 const [claimError, setClaimError] = useState('');
 const [claimed, setClaimed] = useState(false);
 const generation = useRef(0), claimLock = useRef(false), shareLock = useRef(false);
 const load = useCallback(async () => {
  const v = ++generation.current;
  setLoading(true); setLoadError(''); setInvite(null); setShareError('');
  if (!userId) {setLoading(false); setLoadError('Sign in to create your invitation.'); return;}
  try {
   const value = await apiGet<Invitation>('/api/mobile/v1/rewards', {expectedUserId:userId});
   if (v === generation.current) setInvite({...value, ownerId:userId});
  } catch {
   if (v === generation.current) setLoadError('We couldn’t load your invitation. Please try again.');
  } finally {if (v === generation.current) setLoading(false);}
 }, [userId]);
 useFocusEffect(useCallback(() => {
  setCode(''); setNotice(''); setClaimError(''); setClaimed(false); setClaimOpen(false);
  setBusy(false); setSharing(false);
  void load();
  return () => {generation.current++;};
 }, [load]));

 async function share() {
  if (!visibleInvite || shareLock.current) return;
  shareLock.current = true; setSharing(true); setShareError('');
  const v = generation.current;
  try {
   await Share.share({title:'A month of Rezlee Pro, on us', message:`I thought you might like Rezlee. Here’s a free month of Pro to help with bills and the everyday admin at home. Sign up, then enter ${visibleInvite.code} in Rewards within 30 days of joining. No payment details or automatic renewal. ${visibleInvite.url}`});
  } catch {if (v === generation.current) setShareError('Sharing couldn’t open. Try again, or press and hold your code to copy it.');}
  finally {shareLock.current = false; if (v === generation.current) setSharing(false);}
 }
 async function claim() {
  if (!userId || claimLock.current || !/^[A-F0-9]{12}$/.test(code)) return;
  claimLock.current = true; setBusy(true); setNotice(''); setClaimError('');
  const v = generation.current;
  try {
   const result = await apiPost<ClaimResult>('/api/mobile/v1/rewards', {code}, {expectedUserId:userId});
   if (v !== generation.current) return;
   if (result.status === 'claimed') {
    const expiry = result.expiresAt ? new Date(result.expiresAt) : null;
    if (!expiry || !Number.isFinite(expiry.getTime())) throw Error('Your invitation could not be confirmed. Please try again.');
    setClaimed(true);
    setNotice(`Your invitation is redeemed. Pro access is recorded through ${expiry.toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'})}. No automatic renewal.`);
    // Refresh through the existing account-scoped membership publisher; no second claim is made.
    void loadMembership(userId).catch(() => {if (v === generation.current) setClaimError('Your invitation is saved. Open Membership to refresh your Pro access.');});
   } else if (result.status === 'already_pro') setNotice('You already have Rezlee Pro. Your current membership stays exactly as it is.');
   else if (result.status === 'not_new') setNotice('This invitation is for accounts created within the last 30 days. You can still share your own invitation with a friend.');
   else throw Error('Your invitation could not be confirmed. Please try again.');
  } catch (error) {if (v === generation.current) setClaimError(error instanceof Error ? error.message : 'Couldn’t confirm this invitation. Please try again.');}
  finally {claimLock.current = false; if (v === generation.current) setBusy(false);}
 }
 return <SafeAreaView edges={['left','right','bottom']} style={styles.screen}>
  <ScreenNavigation title="Invite a friend" fallback="/(tabs)/home"/>
  <FormScrollView contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
   <View style={styles.intro}>
    <Text accessibilityRole="header" style={styles.title}>Give a friend{ '\n' }Rezlee Pro.</Text>
    <Text style={styles.description}>A month of extra help with bills and life at home. Their first month is on us.</Text>
   </View>
   <View style={styles.invitation}>
    <ReferralPass code={visibleInvite?.code ?? null} loading={loading}/>
    {loadError ? <View style={styles.feedback}>
     <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
     <Button label="Try again" onPress={() => void load()}/>
    </View> : <Button label="Share your invitation" disabled={!visibleInvite} loading={sharing} onPress={() => void share()}/>}
    {shareError ? <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text> : null}
   </View>
   <View style={styles.steps}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>A small gesture. A useful gift.</Text>
    <View style={styles.step}><Text style={styles.number}>01</Text><View style={styles.stepBody}><Text style={styles.stepTitle}>Send your invitation</Text><Text style={styles.detail}>Share your link and code with a friend.</Text></View></View>
    <View style={styles.step}><Text style={styles.number}>02</Text><View style={styles.stepBody}><Text style={styles.stepTitle}>They make themselves at home</Text><Text style={styles.detail}>They sign up, then enter your code in Rewards to unlock their month of Pro.</Text></View></View>
   </View>
   <View style={styles.redeem}>
    <Pressable accessibilityRole="button" accessibilityLabel="Have an invitation code?" accessibilityState={{expanded:claimOpen}} onPress={() => setClaimOpen(value => !value)} style={({pressed}) => [styles.disclosure, {opacity:pressed ? 0.65 : 1}]}>
     <View style={styles.disclosureText}><Text style={styles.stepTitle}>Have an invitation code?</Text><Text style={styles.detail}>Your month starts when you redeem it.</Text></View>
     <Feather accessible={false} name={claimOpen ? 'minus' : 'plus'} size={20} color={colors.primary}/>
    </Pressable>
    {claimOpen ? <View style={styles.claimForm}>
     {!claimed ? <><TextField label="Invitation code" value={code} placeholder="12-character code" autoCapitalize="characters" autoCorrect={false} maxLength={24} editable={!busy} onChangeText={text => {setCode(text.replace(/\s/g,'').toUpperCase().slice(0,12)); setClaimError(''); setNotice('');}}/>
     <Button label="Redeem my month of Pro" loading={busy} disabled={!/^[A-F0-9]{12}$/.test(code)} onPress={() => void claim()}/></> : null}
     {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
     {claimError ? <Text accessibilityRole="alert" style={styles.error}>{claimError}</Text> : null}
     {claimed ? <Button label="View my membership" variant="secondary" onPress={() => router.push('/membership')}/> : null}
    </View> : null}
   </View>
   <Text style={styles.terms}>For friends who joined within the last 30 days. One offer per account. Existing Pro and lifetime memberships stay unchanged. An invitation does not share your home or private records.</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Manage household and invitations" onPress={() => router.push('/household')} style={({pressed}) => [styles.household, {opacity:pressed ? 0.65 : 1}]}>
    <Feather accessible={false} name="users" size={18} color={colors.mutedForeground}/>
    <Text style={styles.householdText}>Inviting someone to your household?</Text>
    <Feather accessible={false} name="arrow-up-right" size={16} color={colors.mutedForeground}/>
   </Pressable>
  </FormScrollView>
 </SafeAreaView>;
}
const styles = StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.canvas},
 content:{paddingHorizontal:24,paddingTop:18,paddingBottom:32,gap:28},
 intro:{gap:12},
 title:{...editorialType,fontSize:36,lineHeight:42,color:colors.foreground},
 description:{...typography.body,color:colors.mutedForeground,maxWidth:440},
 invitation:{gap:14},
 feedback:{gap:12},
 steps:{gap:20},
 sectionTitle:{...editorialType,fontSize:23,lineHeight:30,color:colors.foreground},
 step:{flexDirection:'row',gap:16},
 number:{...typography.meta,lineHeight:22,color:colors.mutedForeground,width:24},
 stepBody:{flex:1,gap:4},
 stepTitle:{...typography.body,fontWeight:'600',color:colors.foreground},
 detail:{...typography.meta,color:colors.mutedForeground},
 redeem:{borderTopWidth:1,borderBottomWidth:1,borderColor:premium.line},
 disclosure:{minHeight:76,flexDirection:'row',alignItems:'center',gap:16,paddingVertical:18},
 disclosureText:{flex:1,gap:4},
 claimForm:{gap:14,paddingBottom:20},
 notice:{...typography.body,color:colors.primary},
 error:{...typography.body,color:colors.criticalForeground},
 terms:{...typography.meta,color:colors.mutedForeground},
 household:{minHeight:44,flexDirection:'row',alignItems:'center',gap:10},
 householdText:{...typography.meta,color:colors.mutedForeground,flex:1},
});
