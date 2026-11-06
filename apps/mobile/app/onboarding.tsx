import { profileName } from "@/lib/profile-identity";
import { supabase } from "@/lib/supabase";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { FormScrollView } from "@/components/FormScrollView";
import { Feather } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { useAccountSwitch } from "@/auth/useAccountSwitch";
import { SetupAccount } from "@/components/SetupAccount";
import { setupDrafts } from "@/lib/onboarding-draft";
import { shouldResumeSetup, type SetupDraft } from "@/lib/onboarding-draft-core";
import { AddressFields } from "@/components/AddressFields";
import { RezleeLoading } from "@/components/RezleeLoading";
import { hasOptionalHomeDetails, hasOptionalHomeErrors, homeProfileErrorSummary, readHomeProfileErrors, validateHomeProfile, type HomeProfileErrors } from "@/lib/home-profile-validation";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { BillExamplePreview } from "@/components/BillExamplePreview";
import { StartingGoalOptions } from "@/components/HomeStartJourney";
import { startingContent, type StartingGoal } from "@/lib/home-start";
import { saveStartingGoal } from "@/lib/home-start-preference";
import { ApiError } from "@/lib/api";
import {
  createHomeProfile,
  fetchOnboarding,
  type HomeProfileInput,
  type OnboardingPayload,
} from "@/lib/onboarding-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";

type Step = 1 | 2;
function Progress({ step }: { step: Step }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {[1, 2].map((value) => (
        <View
          key={value}
          style={{
            flex: 1,
            height: 4,
            borderRadius: radii.full,
            backgroundColor: value <= step ? colors.primary : colors.muted,
          }}
        />
      ))}
    </View>
  );
}

function OptionSelector({
  label,
  options,
  value,
  onChange,
  disabled = false,
  error,
}: {
  error?: string;
  disabled?: boolean;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, ...(error ? { borderWidth: 1, borderColor: colors.criticalForeground, borderRadius: radii.md, padding: spacing.sm } : {}) }}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onChange(active ? "" : option)}
              style={({ pressed }) => ({
                minHeight: layout.touchMin,
                justifyContent: "center",
                paddingHorizontal: spacing.md,
                borderRadius: radii.full,
                backgroundColor: active ? colors.primary : colors.secondary,
                opacity: pressed ? 0.86 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primaryForeground : colors.secondaryForeground }}>
                {option === "Shared home" ? "Shared with roommates" : option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.criticalForeground, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}
export default function OnboardingScreen() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <RezleeLoading />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  // A new identity always gets fresh component state; late reads belong to the old mount.
  return <AccountSetup key={session.user.id} userId={session.user.id} email={session.user.email} />;
}

function AccountSetup({ userId, email }: { userId: string; email?: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const [displayName,setDisplayName]=useState(()=>profileName(session?.user.user_metadata));
  const active = useRef(true);
  const draftRevision = useRef(0);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const finishLock = useRef(false);
  const saveLock = useRef(false);
  const account = useAccountSwitch(() => !saveLock.current && !finishLock.current);
  const [addressResolving, setAddressResolving] = useState(false);
  const [moreDetails, setMoreDetails] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [payload, setPayload] = useState<OnboardingPayload | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<HomeProfileErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<StartingGoal>("bills");
  const [form, setForm] = useState<HomeProfileInput>({
    nickname: "Home",
    street_address: "",
    city: "",
    province: "",
    postal_code: "",
    home_type: "",
    ownership_type: "",
    approximate_year_built: "",
  });

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    if (account.busy) return;
    let active = true;
    Promise.all([fetchOnboarding(), setupDrafts.read(userId)])
      .then(([data, draft]) => {
        if (!active || account.switching.current) return;
        if (data.home) {
          if (shouldResumeSetup(draft, data.home.id, data.accessRole)) {
            setStep(2);
            setSelectedGoal(draft!.goal);
            setForm(draft!.form);
            setRestored(true);
          } else {
            void setupDrafts.clear(userId).catch(() => {});
            router.replace("/(tabs)/home");
            return;
          }
        } else if (draft) {
          setForm(draft.form);
          setSelectedGoal(draft.goal);
          setMoreDetails(hasOptionalHomeDetails(draft.form));
          setRestored(true);
        }
        setPayload(data);
      })
      .catch((loadError) => {
        if (!active || account.switching.current) return;
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "We could not start setup. Please try again.",
        );
      })
      .finally(() => {
        if (active && !account.switching.current) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, attempt, userId, account.busy, account.switching]);

  function draftFor(nextForm: HomeProfileInput, goal = selectedGoal, phase: SetupDraft["phase"] = step === 2 ? "choose" : "form"): SetupDraft {
    return { version: 1, updatedAt: Date.now(), form: nextForm, goal, phase, ...(payload?.home ? { homeId: payload.home.id } : {}) };
  }
  function persistDraft(draft: SetupDraft) {
    if (!userId) return;
    const revision = ++draftRevision.current;
    setDraftNotice("Saving progress…");
    void setupDrafts.write(userId, draft).then(() => {
      if (active.current && revision === draftRevision.current) setDraftNotice("Progress saved on this device.");
    }).catch(() => {
      if (active.current && revision === draftRevision.current) setDraftNotice("Progress couldn’t be saved on this device. Keep this screen open and try again.");
    });
  }
  function updateForm(change: Partial<HomeProfileInput>) {
    if (account.switching.current || saveLock.current || finishLock.current) return;
    const next = { ...form, ...change };
    setForm(next); persistDraft(draftFor(next));
    setFieldErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in change))));
    setError(null);
  }
  function chooseGoal(goal: StartingGoal) {
    if (account.switching.current || saveLock.current || finishLock.current) return;
    setSelectedGoal(goal); persistDraft(draftFor(form, goal));
  }

  async function savePlace() {
    if (!userId || !payload || addressResolving || saveLock.current || account.switching.current) return;
    const validation = validateHomeProfile(form, payload, displayName);
    setFieldErrors(validation); setError(null);
    if (Object.keys(validation).length) {
      if (hasOptionalHomeErrors(validation)) setMoreDetails(true);
      return;
    }
    saveLock.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const chosenName=displayName.trim();
      if(chosenName){
        const current=await supabase.auth.getSession();
        if(current.data.session?.user.id!==userId){ setError("Your account changed. Please reopen setup."); return; }
        const saved=await supabase.auth.updateUser({data:{full_name:chosenName,rezlee_display_name:chosenName}});
        if(saved.error || saved.data.user?.id!==userId){ setError("We couldn’t save your name. Please try again."); return; }
      }
      await setupDrafts.write(userId, draftFor(form, selectedGoal, "saving"));
      if (!active.current) return;
      const next = await createHomeProfile({ ...form, nickname: form.nickname.trim() || "Home" });
      if (!active.current) return;
      setPayload(next);
      setStep(2);
      if (next.home) {
        try { await setupDrafts.write(userId, { ...draftFor(form, selectedGoal, "choose"), homeId: next.home.id }); }
        catch { setDraftNotice("Your place is saved. Finish below to choose your next step."); }
      }
    } catch (saveError) {
      if (!active.current) return;
      const errors = saveError instanceof ApiError ? readHomeProfileErrors(saveError.details) : {};
      setFieldErrors(errors);
      if (hasOptionalHomeErrors(errors)) setMoreDetails(true);
      setError(Object.keys(errors).length ? null : saveError instanceof ApiError
        ? saveError.message : "We could not save your place. Please try again.");
    } finally {
      saveLock.current = false;
      if (active.current) setIsSaving(false);
    }
  }
  async function finish(startTask: boolean) {
    if (!userId || !payload?.home || finishLock.current || account.switching.current) return;
    finishLock.current = true;
    setIsSaving(true); setError(null);
    try {
      await saveStartingGoal(payload.home.id, selectedGoal);
      if (!active.current) return;
      await setupDrafts.clear(userId);
      if (!active.current) return;
      router.replace({ pathname: "/(tabs)/home", params: { begin: startTask ? selectedGoal : "" } });
    } catch {
      if (active.current) setError("We couldn’t finish setup. Please try again.");
    } finally { finishLock.current = false; if (active.current) setIsSaving(false); }
  }
  const accountControl = <SetupAccount email={email} busy={account.busy} error={account.error}
    disabled={isSaving} onSwitch={() => void account.switchAccount()} />;
  const controlsDisabled = isSaving || account.busy;
  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <RezleeLoading />
      </SafeAreaView>
    );
  }

  if (!payload) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: layout.screenHorizontal, gap: spacing.md }}>
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={[typography.title, { color: colors.foreground }]}>Setup could not load</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            {error ?? "Please return to sign in and try again."}
          </Text>
          <Button label="Try again" disabled={account.busy} onPress={() => { setIsLoading(true); setError(null); setAttempt(value => value + 1); }} />
          {accountControl}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <View style={{ flex: 1 }}>
        <AmbientBackdrop />
        <FormScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: layout.screenHorizontal,
            paddingTop: spacing.lg,
            paddingBottom: spacing["4xl"],
            gap: spacing.xl,
          }}
        >
          <Progress step={step} />
          {restored ? <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.mutedForeground }]}>Continue where you left off.</Text> : null}
          {draftNotice ? <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.mutedForeground }]}>{draftNotice}</Text> : null}

          {step === 1 ? (
            <View style={{ gap: spacing.xl }}>
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.label, { color: colors.mutedForeground }]}>Step 1 of 2</Text>
                <Text style={[typography.heading, { color: colors.foreground }]}>Where’s home?</Text>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>
                  Start with your city and province or territory. You can add an address or more details whenever you like.
                </Text>
              </View>

              <View style={{ gap: spacing.md }}>
                <TextField label="What should we call you? (optional)" error={fieldErrors.display_name} value={displayName} onChangeText={value => { setDisplayName(value); setFieldErrors(previous => ({ ...previous, display_name: undefined })); setError(null); }} maxLength={100} autoComplete="name" editable={!controlsDisabled}/>
                <AddressFields errors={fieldErrors} cityOnly onResolvingChange={setAddressResolving} value={form} disabled={controlsDisabled} searchEnabled={payload.addressSearchAvailable === true} onChange={address => updateForm(address)} />
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreDetails }} disabled={controlsDisabled} onPress={() => setMoreDetails(value => !value)}
                  style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={[typography.body, { color: colors.primary }]}>Add an address or more details (optional)</Text>
                  <Feather name={moreDetails ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                </Pressable>
                {moreDetails ? <View style={{ gap: spacing.md }}>
                  <AddressFields errors={fieldErrors} hideLocation value={form} disabled={controlsDisabled} searchEnabled={false} onChange={address => updateForm(address)} />
                  <TextField error={fieldErrors.nickname} label="Home nickname (optional)" maxLength={80} editable={!controlsDisabled} value={form.nickname} onChangeText={nickname => updateForm({ nickname })} />
                  <TextField error={fieldErrors.approximate_year_built} label="Approximate year built (optional)" maxLength={4} editable={!controlsDisabled} keyboardType="number-pad" placeholder="2018" value={form.approximate_year_built} onChangeText={approximate_year_built => updateForm({ approximate_year_built })} />
                  {form.closing_date || fieldErrors.closing_date ? <TextField error={fieldErrors.closing_date} label="Move-in or closing date (optional)" placeholder="YYYY-MM-DD" maxLength={10} editable={!controlsDisabled} value={form.closing_date ?? ""} onChangeText={closing_date => updateForm({ closing_date })} /> : null}
                </View> : null}
              </View>

              {moreDetails ? <>
              <OptionSelector
                disabled={controlsDisabled}
                error={fieldErrors.home_type}
                label="Home type (optional)"
                options={payload.homeTypeOptions}
                value={form.home_type}
                onChange={home_type => updateForm({ home_type })}
              />
              <OptionSelector
                disabled={controlsDisabled}
                error={fieldErrors.ownership_type}
                label="Living situation (optional)"
                options={payload.ownershipTypeOptions}
                value={form.ownership_type}
                onChange={ownership_type => updateForm({ ownership_type })}
              />
              </> : null}


            </View>
          ) : null}
          {step === 2 ? <View style={{ gap: spacing.xl }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[typography.label, { color: colors.mutedForeground }]}>Your place is ready</Text>
              <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>What would help today?</Text>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>Start with one useful thing. Rezlee brings saved changes and upcoming dates into view on Home. You can add the rest later.</Text>
            </View>
            <StartingGoalOptions selected={selectedGoal} onSelect={chooseGoal} disabled={controlsDisabled} />
            {selectedGoal === "bills" ? <View style={{ gap: spacing.sm }}>
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>Next, choose how to add a bill: upload a statement, enter details or connect your provider. No connection is required.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showExample }} onPress={() => setShowExample(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>{showExample ? "Hide example" : "See what you can learn"}</Text>
              </Pressable>
              {showExample ? <><BillExamplePreview /><Text style={[typography.caption, { color: colors.mutedForeground }]}>Fictional example using three completed statements. Your own results depend on the bills you add.</Text></> : null}
            </View> : null}
            {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}


          </View> : null}
          <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => void account.switchAccount()} style={{minHeight:44,justifyContent:"center"}}><Text style={[typography.meta,{color:colors.primary}]}>Use a different account</Text></Pressable>
          {account.error ? <Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{account.error}</Text> : null}
        </FormScrollView>
        <View style={{paddingHorizontal:layout.screenHorizontal,paddingVertical:12,gap:4}}>
          {step === 1 && (error || homeProfileErrorSummary(fieldErrors)) ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.criticalForeground, fontSize: 13, lineHeight: 18 }}>{error || homeProfileErrorSummary(fieldErrors)}</Text> : null}
          {step===1 ? <Button label="Continue" loading={isSaving} disabled={account.busy || addressResolving} onPress={savePlace}/> : <>
            <Button label={startingContent[selectedGoal].action} disabled={account.busy} loading={isSaving} onPress={() => void finish(true)}/>
            <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={() => void finish(false)} style={{minHeight:44,alignItems:"center",justifyContent:"center"}}><Text style={[typography.meta,{color:colors.primary}]}>Explore my Home first</Text></Pressable>
          </>}
        </View>
      </View>
    </SafeAreaView>
  );
}
