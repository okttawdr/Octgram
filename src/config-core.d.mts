export type PublicConfigInput = { supabaseUrl?: string; supabaseAnonKey?: string; apiBaseUrl?: string; livekitUrl?: string; cloudinaryCloudName?: string; agoraAppId?: string };
export function resolvePublicConfig(runtime?: PublicConfigInput, build?: Record<string, string | undefined>): {
  supabaseUrl: string; supabaseAnonKey: string; apiBaseUrl: string; livekitUrl: string; cloudinaryCloudName: string; agoraAppId: string; configured: boolean;
};
