import { createClient } from "@supabase/supabase-js";
import { createRepository } from "./repository.mjs";

export function createSupabaseGateway(config) {
  const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await authClient.auth.getUser(token);
      return error ? null : data.user;
    },
    createUserClient(token) {
      return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
    createRepository(token) { return createRepository(this.createUserClient(token)); },
    createServiceClient() {
      if (!config.supabaseServiceRoleKey) return null;
      return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    },
  };
}
