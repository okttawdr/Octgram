import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "../config";
const url = runtimeConfig.supabaseUrl || "https://setup.invalid.supabase.co";
const key = runtimeConfig.supabaseAnonKey || "setup-only-public-key";
export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
  realtime: { params: { eventsPerSecond: 5 } },
});
