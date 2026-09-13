import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading],
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
