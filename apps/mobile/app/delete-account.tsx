import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import { confirmAccountPassword } from "@/auth/confirm-password";
import { inventoryCreateStore } from "@/lib/inventory-create";
import { statementBatches } from "@/lib/statement-batch";
import {receiptBatches} from "@/lib/receipt-batch";
import {vaultPending} from "@/lib/vault-pending";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, AppState, Linking, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { emailCode, emailCodeReady } from "@/auth/email-code";
import { statementDrafts } from "@/lib/statement-draft";
import { setupDrafts } from "@/lib/onboarding-draft";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { BriefHeading, QuietAction, ReadNotice } from "@/components/Brief";
import { TextField } from "@/components/TextField";
import { supabase } from "@/lib/supabase";
import { ApiError } from "@/lib/api";
import { clearDeletionReceipt, deletionPreview, deletionStatus, prepareDeletionReceipt, readDeletionReceipt, submitDeletion, type DeletionPreview, type DeletionReceipt, type DeletionStatus } from "@/lib/account-deletion";
import { layout, spacing, typography } from "@/theme/tokens";

export default function DeleteAccount() {
  const { session } = useAuth();
  return <DeleteAccountFlow key={session?.user.id ?? "signed-out"}/>;
}
function DeleteAccountFlow() {
  const { colors } = useTheme();

  const router = useRouter();
  const { session } = useAuth();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [code, setCode] = useState("");
  const [codeMode, setCodeMode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [now, setNow] = useState(Date.now);
  const socialOnly = Boolean(session && ["google", "apple"].includes(session.user.app_metadata.provider ?? ""));
  const useCode = socialOnly || codeMode;
  const codeAvailable = emailCodeReady && preview?.emailCodeAvailable === true;
  const wait = Math.max(0, Math.ceil((emailCode.retryAt() - now) / 1000));
  useEffect(() => { if (!useCode) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [useCode]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const running = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  usePreventRemove(busy, () => Alert.alert("Confirming your request", "Please wait for this step to finish."));
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const saved = await readDeletionReceipt(session?.user.id);
      if (!active.current) return;
      if (saved && (!session || saved.userId === session.user.id)) {
        setReceipt(saved);
        try {
          const nextStatus = await deletionStatus(saved);
          if (!active.current) return;
          setStatus(nextStatus); setUnconfirmed(false); setError(null); return;
        } catch (err) {
          if (!active.current) return;
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          setUnconfirmed(true);
        }
      }
      if (session) { const next = await deletionPreview(); if (!active.current) return; setPreview(next); if (next.deletion) { setStatus(next.deletion); setUnconfirmed(true); } }
      setError(null);
    } catch { if (active.current) setError("We couldn’t check your account. Your deletion has not been confirmed as complete."); }
    finally { if (active.current) setLoading(false); running.current = false; }
  }, [session]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    if (!status || status.status === "completed" || status.status === "needs_attention") return;
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 15_000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [status, refresh]);
  async function submit() {
    if (running.current || !session?.user.email) return;
    running.current = true; setBusy(true); setError(null);
    let authenticated = false;
    try {
      if (useCode) {
        if (!codeAvailable) throw new Error("Email verification is unavailable.");
        await emailCode.verify(session.user.email, code, session.user.id);
        setCode("");
      } else {
        await confirmAccountPassword(session.user.id, session.user.email, password);
        setPassword("");
      }
      if (!active.current) return;
      authenticated = true;
      const saved = await prepareDeletionReceipt(session.user.id, status?.requestId);
      if (!active.current) return;
      setReceipt(saved); setUnconfirmed(true);
      const accepted = await submitDeletion(saved);
      if (!active.current) return;
      setStatus(accepted); setUnconfirmed(false); setConfirmation("");
    } catch (err) {
      if (!active.current) return;
      setPassword(""); setCode("");
      setError(!authenticated ? "Your identity couldn’t be confirmed. Check your code or password and try again. No new deletion request was submitted." : err instanceof ApiError ? err.message : "We couldn’t confirm your request. Check its status before trying again.");
    } finally { if (active.current) setBusy(false); running.current = false; }
  }
  async function sendCode() {
    if (running.current || !session?.user.email || !codeAvailable || wait) return;
    running.current = true; setBusy(true); setError(null);
    try { await emailCode.request(session.user.email); if (!active.current) return; setCodeSent(true); setCode(""); }
    catch { if (active.current) setError("We couldn’t send a code. Try again shortly."); }
    finally { running.current = false; if (active.current) { setBusy(false); setNow(Date.now()); } }
  }
  function confirm() {
    Alert.alert("Permanently delete your account?", "Your private information and homes you own will be removed. Shared expense history in someone else’s household remains. This cannot be undone.", [
      { text: "Keep my account", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => void submit() },
    ]);
  }
  async function finish() {
    setBusy(true);
    try {
      const deletedUserId = receipt?.userId ?? session?.user.id;
      const requestId = receipt?.requestId ?? status?.requestId;
      if (!deletedUserId || !requestId || status?.status !== "completed") throw Error("Deletion not confirmed.");
      const current = (await supabase.auth.getSession()).data.session?.user.id;
      if (current && current !== deletedUserId) throw Error("Account changed.");
      // Local sign-out is sufficient after the server has removed Auth/refresh sessions.
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error) throw new Error("Sign out failed");
      if (deletedUserId) {
        const pendingItem = await inventoryCreateStore.load(deletedUserId);
        if (pendingItem) await inventoryCreateStore.forget(deletedUserId, pendingItem.requestId);
        await setupDrafts.clear(deletedUserId);
        await statementDrafts.clear(deletedUserId);
        await vaultPending.clear(deletedUserId);
        await receiptBatches.removeAccount(deletedUserId);
        await statementBatches.removeAccount(deletedUserId);
        await SecureStore.deleteItemAsync("rezlee.lock.v1." + deletedUserId);
        await SecureStore.deleteItemAsync("shared-expense-save-" + deletedUserId);
      }
      await clearDeletionReceipt(deletedUserId, requestId);
      if (!(await supabase.auth.getSession()).data.session) router.replace("/(auth)/login");
    } catch { setError("We couldn’t clear this device’s sign-in. Please try again."); }
    finally { setBusy(false); }
  }
  const completed = status?.status === "completed";
  const pending = status && !completed && !unconfirmed;
  const credentialsReady = useCode ? codeAvailable && /^\d{6,8}$/.test(code) : Boolean(password);
  const canSubmit = preview?.enabled && session && !pending && !completed;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Delete account" fallback={session ? "/account" : "/(auth)/login"} />
    {status ? <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false, headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Close deletion status" onPress={() => router.replace("/(auth)/login")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.primary }}>Close</Text></Pressable> }} /> : null}
    <View style={{ flex: 1 }}  >
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: spacing.xl }}>
        {loading ? <ActivityIndicator accessibilityLabel="Checking your account" color={colors.primary} /> : null}
        {completed ? <>
          <BriefHeading title="Your account is deleted" detail="Your active account, private records and uploads have been removed. Shared expense history in someone else’s household remains. Your utility service accounts remain open." />
          <Text style={[typography.body, { color: colors.mutedForeground }]}>This completion receipt is available for 14 days. Backup and service-provider retention is separate from removal of your active account.</Text>
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.body, { color: colors.foreground }]}>Used Sign in with Apple?</Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>If Rezlee still appears in your Apple Account’s Sign in with Apple list, select it and stop using Sign in with Apple. On iPhone, this list is in Settings → your name → Sign in with Apple.</Text>
            <QuietAction label="Open Apple Account" onPress={() => { void Linking.openURL("https://account.apple.com").catch(() => setError("We couldn’t open Apple Account. You can check Sign in with Apple in your device settings.")); }} />
          </View>
          <QuietAction label={busy ? "Signing out…" : "Return to sign in"} disabled={busy} onPress={() => void finish()} />
        </> : pending ? <>
          <BriefHeading title={status.status === "needs_attention" ? "Deletion needs attention" : "Your deletion is in progress"}
            detail={status.status === "needs_attention" ? "We couldn’t finish safely. Your account is locked, but deletion is not complete. Keep the request number below for support." : "Your account is locked while we disconnect providers and remove your information. You can close the app and return to this screen."} />
          <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.foreground }]}>{status.phase === "connections" ? "Disconnecting provider access" : status.phase === "files" ? "Removing private uploads" : "Removing your account"}{status.status === "retry" ? " · Waiting to retry" : ""}</Text>
          <QuietAction label="Check status" onPress={() => void refresh()} />
        </> : !loading ? <>
          <BriefHeading title="Leave Rezlee" detail="Permanently remove your account and the information you’ve saved." />
          {!preview?.enabled ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{session ? "Deletion is not available in this build yet. Your account has not been changed." : "Sign in to manage your account. If you already requested deletion, this device’s receipt may have expired. We cannot confirm completion from this screen."}</Text> : <>
            <Text style={[typography.body, { color: colors.foreground }]}>Your private bills, documents, belongings, warranties, tasks and conversation history will be removed. Shared expense entries, including names and notes, stay in households owned by someone else so their balances and history remain accurate. Download anything you want to keep first.</Text>
            {preview.impact ? <View style={{ gap: spacing.md }}>
              {preview.impact.homes > 0 ? <Text style={[typography.body, { color: colors.foreground }]}>You own {preview.impact.homes === 1 ? "1 home" : `${preview.impact.homes} homes`} in Rezlee. {preview.impact.sharedMemberships > 0 ? "Other household members will lose access to these homes, shared Care and shared expenses. Their own accounts remain." : "These homes and their saved information will also be removed."}</Text> : null}
              {preview.impact.joinedHomes > 0 ? <Text style={[typography.body, { color: colors.foreground }]}>You’ll leave homes you joined. Their owners keep their information, and tasks assigned to you become unassigned.</Text> : null}
            </View> : null}
            <Text style={[typography.body, { color: colors.mutedForeground }]}>We’ll revoke the provider authorizations we have saved before confirming deletion. This does not cancel your utility service or pay any bills. If a provider cannot be disconnected, deletion will wait for support.</Text>
            <Text style={[typography.body, { color: colors.foreground }]}>Deleting Rezlee does not cancel an Apple or Google Play subscription. Cancel it in your store account to stop future renewals.</Text>
            <QuietAction label="Manage store subscriptions" disabled={busy} onPress={() => { void Linking.openURL(Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions").catch(() => setError("Open subscriptions in your app store account.")); }} />
            <Text style={[typography.body, { color: colors.mutedForeground }]}>Deletion cannot be undone. Backup and service-provider retention is separate from removal of your active account.</Text>
            {unconfirmed ? <ReadNotice message="The previous request hasn’t been confirmed. Check its status, or verify your identity to submit the same request again." onRetry={() => void refresh()} /> : null}
            {useCode ? <View style={{ gap: spacing.md }}>
              {!codeAvailable ? <Text style={[typography.body, { color: colors.mutedForeground }]}>Email verification isn’t available in this build yet. Your account has not been changed.</Text> : <>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>Confirm access to {session?.user.email}. {codeSent ? "Check your inbox and junk folder for the code." : "We’ll request a code for this account before accepting deletion."}</Text>
                <QuietAction label={wait ? `Send another code in ${wait}s` : codeSent ? "Send another code" : "Send verification code"} disabled={busy || wait > 0} onPress={() => void sendCode()} />
                <TextField label="Email verification code" value={code} onChangeText={setCode} editable={!busy} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={8} />
              </>}
              {!socialOnly ? <QuietAction label="Use my password instead" disabled={busy} onPress={() => { setCodeMode(false); setCode(""); }} /> : null}
            </View> : <>
              <TextField label="Current password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" value={password} onChangeText={setPassword} editable={!busy} />
              {codeAvailable ? <QuietAction label="Use an email code instead" disabled={busy} onPress={() => { setCodeMode(true); setPassword(""); }} /> : null}
            </>}
            <TextField label="Type DELETE to confirm" autoCapitalize="characters" autoCorrect={false} value={confirmation} onChangeText={setConfirmation} editable={!busy} />
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit || busy || !credentialsReady || confirmation !== "DELETE" }}
              disabled={!canSubmit || busy || !credentialsReady || confirmation !== "DELETE"} onPress={confirm}
              style={({ pressed }) => ({ minHeight: 48, paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: colors.destructive, opacity: !credentialsReady || confirmation !== "DELETE" || busy ? 0.45 : pressed ? 0.7 : 1 })}>
              <Text style={[typography.body, { color: colors.destructive, fontWeight: "600" }]}>{busy ? "Confirming…" : "Permanently delete account"}</Text>
            </Pressable>
            <QuietAction label="Keep my account" disabled={busy} onPress={() => router.replace("/account")} />
          </>}
        </> : null}
        {error ? <ReadNotice message={error} onRetry={() => void refresh()} busy={busy} /> : null}
        {status || receipt ? <Text selectable style={[typography.meta, { color: colors.mutedForeground }]}>Request: {status?.requestId ?? receipt?.requestId}</Text> : null}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}
