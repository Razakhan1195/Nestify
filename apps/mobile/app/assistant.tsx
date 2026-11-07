import { useTheme } from "@/theme/useTheme";
import { fetchHome } from "@/lib/home-data";
import { contextualHomeQuestions } from "@/lib/home-outcome-brief";
import { QuietAction } from "@/components/Brief";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api";
import {
  askRezlee,
  type AssistantMessage,
} from "@/lib/assistant-data";
import { radii, spacing, typography } from "@/theme/tokens";
function makeMessage(role: AssistantMessage["role"], text: string): AssistantMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
  };
}

export default function AssistantScreen() {
  const { colors , mode: useThemeMode } = useTheme();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const didUseInitialPrompt = useRef(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions,setSuggestions]=useState<string[]>(contextualHomeQuestions(null));
  const [retryMessages,setRetryMessages]=useState<AssistantMessage[]|null>(null);
  const sending=useRef(false);
  useEffect(()=>{let active=true;void fetchHome().then(home=>{if(active&&!home.needsOnboarding)setSuggestions(contextualHomeQuestions(home));}).catch(()=>{});return()=>{active=false;};},[]);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const send = useCallback(async (rawText: string, retry?: AssistantMessage[]) => {
    const text = rawText.trim();
    if (!text || sending.current) return;
    sending.current=true;

    const userMessage = makeMessage("user", text);
    const nextMessages = retry ?? [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setRetryMessages(null);
    setIsSending(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const response = await askRezlee(nextMessages);
      setMessages((current) => [...current, {...makeMessage("assistant", response.reply),references:response.references}]);
    } catch (sendError) {
      setRetryMessages(nextMessages);
      setError(
        sendError instanceof ApiError
          ? sendError.message
          : "Rezlee could not answer right now. Please try again.",
      );
    } finally {
      sending.current=false;
      setIsSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [messages]);

  useEffect(() => {
    if (!q || didUseInitialPrompt.current) return;
    didUseInitialPrompt.current = true;
    void send(q);
  }, [q, send]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      const screenHeight = Dimensions.get("screen").height;
      const overlap = Math.max(
        0,
        screenHeight - event.endCoordinates.screenY,
      );
      setKeyboardInset(overlap + spacing.lg);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);

  const closeAssistant = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home");
    }
  }, [router]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <View style={{ flex: 1, paddingBottom: keyboardInset }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Ask Rezlee"
            onPress={closeAssistant}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised }}
          >
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>Ask Rezlee</Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Grounded in your home</Text>
          </View>
          <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="star" size={14} color={colors.primaryForeground} />
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => messages.length && scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={{ paddingTop: spacing["3xl"], gap: spacing.xl }}>
              <View style={{ alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 74, height: 74, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="star" size={28} color={colors.primaryForeground} />
                </View>
                <View style={{ alignItems: "center", gap: spacing.sm }}>
                  <Text style={[typography.title, { color: colors.foreground, textAlign: "center" }]}>What do you want to know about your place?</Text>
                  <Text style={[typography.body, { color: colors.mutedForeground, textAlign: "center", maxWidth: 320 }]}>Understand your saved information and choose a next step. Rezlee will tell you when something is missing.</Text>
                </View>
              </View>

              <View style={{ gap: spacing.sm }}>
                <QuietAction label="Help me fix this — start or resume" onPress={()=>router.push("/repairs")}/>
                <QuietAction label="Before I spend — review a quote" onPress={()=>router.push("/quotes")}/>
                {suggestions.map((prompt) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    onPress={() => void send(prompt)}
                    style={({ pressed }) => ({
                      minHeight: 54,
                      borderRadius: radii.xl,
                      backgroundColor: colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: spacing.lg,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      opacity: pressed ? 0.78 : 1,
                    })}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="arrow-up-right" size={14} color={colors.primary} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={{
                  alignSelf: message.role === "user" ? "flex-end" : "stretch",
                  maxWidth: message.role === "user" ? "86%" : "100%",
                  borderRadius: radii["2xl"],
                  backgroundColor: message.role === "user" ? colors.primary : colors.surfaceRaised,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderWidth: message.role === "assistant" ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <Text style={[typography.body, { color: message.role === "user" ? colors.primaryForeground : colors.foreground }]}>{message.text}</Text>
                {message.role==="assistant"?message.references?.map(ref=><QuietAction key={ref.id} label={ref.label+" →"} onPress={()=>router.push(ref.href as never)}/>):null}
              </View>
            ))
          )}

          {isSending ? (
            <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii["2xl"], backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>Checking your saved context…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={{ borderRadius: radii.xl, backgroundColor: colors.criticalBg, padding: spacing.md }}>
              <Text style={[typography.meta, { color: colors.criticalForeground }]}>{error}</Text>
              {retryMessages?<QuietAction label="Try this question again" disabled={isSending} onPress={()=>void send(retryMessages.at(-1)?.text ?? "",retryMessages)}/>:null}
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.sm,
            paddingBottom: keyboardInset > 0 ? spacing.sm : Math.max(spacing.md, insets.bottom),
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, borderRadius: radii["2xl"], backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, padding: 6 }}>
            <TextInput keyboardAppearance={useThemeMode} selectionColor={colors.primary}
              accessibilityLabel="Your question for Rezlee"
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your place…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={4000}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => void send(input)}
              onFocus={() =>
                requestAnimationFrame(() =>
                  scrollRef.current?.scrollToEnd({ animated: true }),
                )
              }
              style={{ flex: 1, minHeight: 42, maxHeight: 120, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.foreground }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!input.trim() || isSending}
              onPress={() => void send(input)}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: input.trim() && !isSending ? colors.primary : colors.muted,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Feather name="arrow-up" size={18} color={input.trim() && !isSending ? colors.primaryForeground : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
