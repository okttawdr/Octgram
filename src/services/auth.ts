import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { authUrls, googleOAuthOptions } from "./auth-core.mjs";

const origin = () => window.location.origin;

export const authService = {
  signInWithGoogle: () => supabase.auth.signInWithOAuth(googleOAuthOptions(origin())),
  signInWithPassword: (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string, fullName: string) => supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authUrls(origin()).callback },
  }),
  requestPasswordReset: (email: string) => supabase.auth.resetPasswordForEmail(email, { redirectTo: authUrls(origin()).recovery }),
  updatePassword: (password: string) => supabase.auth.updateUser({ password }),
  signOut: () => supabase.auth.signOut(),
  getSession: () => supabase.auth.getSession(),
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => supabase.auth.onAuthStateChange(callback),
};
