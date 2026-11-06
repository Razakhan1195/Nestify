import { setScreenAccount } from "@/lib/screen-state";
import { unregisterPushNotifications } from "@/lib/push-notifications";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cancelSocialSignIn, onSocialSignIn } from "./social-auth";
import { observeSessionBootstrap } from "./session-bootstrap";
import { supabase } from "@/lib/supabase";
import { createEmailAuth, type EmailAuthResult } from "./email-auth";

const emailConfirmationRedirect = new URL("/auth/mobile-confirmed", process.env.EXPO_PUBLIC_API_URL || "https://rezlee.com").toString();
const emailAuth = createEmailAuth(supabase.auth, Date.now, emailConfirmationRedirect);

type AuthContextValue = {
  recentSignIn: { userId: string; at: number } | null;
  session: Session | null;
  isLoading: boolean;
  isRestoringSession: boolean;
  signIn: (email: string, password: string) => Promise<EmailAuthResult>;
  signUp: (email: string, password: string, preferredName?: string) => Promise<EmailAuthResult>;
  resendConfirmation: (email: string) => Promise<EmailAuthResult>;
  signOut: (options?: { scope: "local" | "global" }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [recentSignIn, setRecentSignIn] = useState<{ userId: string; at: number } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  useEffect(() => onSocialSignIn(setRecentSignIn), []);

  useEffect(() => observeSessionBootstrap<Session>({
    read: async () => (await supabase.auth.getSession()).data.session,
    subscribe: listener => {
      const { data } = supabase.auth.onAuthStateChange(listener);
      return () => data.subscription.unsubscribe();
    },
    changed: state => {
      setScreenAccount(state.session?.user.id ?? null);
      if (!state.session && !state.isRestoringSession) setRecentSignIn(null);
      setSession(state.session);
      setIsLoading(state.isLoading);
      setIsRestoringSession(state.isRestoringSession);
    },
  }), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      isRestoringSession,
      recentSignIn,
      signIn: async (email, password) => {
        const result = await emailAuth.signIn(email, password);
        if (!result.error) {
          const { data } = await supabase.auth.getSession();
          if (data.session) setRecentSignIn({ userId: data.session.user.id, at: Date.now() });
        }
        return result;
      },
      signUp: emailAuth.signUp,
      resendConfirmation: emailAuth.resendConfirmation,
      signOut: async (options) => {
        await cancelSocialSignIn().catch(() => {});
        await unregisterPushNotifications(session?.user.id).catch(()=>{});
        const { error } = await supabase.auth.signOut(options);
        if (error) throw error;
        setRecentSignIn(null);
      },
    }),
    [session, isLoading, isRestoringSession, recentSignIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
