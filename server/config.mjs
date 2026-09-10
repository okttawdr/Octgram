export function loadServerConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("SUPABASE_URL dan SUPABASE_ANON_KEY wajib diisi.");
  const defaultOrigin = `http://localhost:${env.PORT || 3000}`;
  const origins = String(env.APP_ORIGIN || defaultOrigin).split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  for (const hostname of [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) if (hostname) origins.push(`https://${String(hostname).replace(/^https?:\/\//, "").replace(/\/$/, "")}`);
  const allowedOrigins = [...new Set(origins)];
  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    allowedOrigin: allowedOrigins[0],
    allowedOrigins,
    port: Number(env.PORT || 3000),
    host: String(env.HOST || "0.0.0.0"),
    maxBodyBytes: 262_144,
    livekitUrl: String(env.LIVEKIT_URL || "").trim(),
    livekitApiKey: String(env.LIVEKIT_API_KEY || "").trim(),
    livekitApiSecret: String(env.LIVEKIT_API_SECRET || "").trim(),
    cloudinaryCloudName: String(env.CLOUDINARY_CLOUD_NAME || "").trim(),
    cloudinaryApiKey: String(env.CLOUDINARY_API_KEY || "").trim(),
    cloudinaryApiSecret: String(env.CLOUDINARY_API_SECRET || "").trim(),
    agoraAppId: String(env.AGORA_APP_ID || "").trim(),
    agoraAppCertificate: String(env.AGORA_APP_CERTIFICATE || "").trim(),
    agoraWebhookSecret: String(env.AGORA_WEBHOOK_SECRET || "").trim(),
    meteredApiKey: String(env.METERED_API_KEY || "").trim(),
    meteredDomain: String(env.METERED_DOMAIN || "").trim(),
  };
}
