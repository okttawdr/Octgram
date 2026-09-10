const missing = (value) => !value || /YOUR_(PROJECT|KEY)|ISI_|CHANGE_ME/i.test(value);

export function resolvePublicConfig(runtime = {}, build = {}) {
  const supabaseUrl = String(runtime.supabaseUrl || build.VITE_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(runtime.supabaseAnonKey || build.VITE_SUPABASE_ANON_KEY || "").trim();
  const apiBaseUrl = String(runtime.apiBaseUrl || build.VITE_API_BASE_URL || "/api").trim().replace(/\/$/, "") || "/api";
  const livekitUrl = String(runtime.livekitUrl || build.VITE_LIVEKIT_URL || "").trim();
  const cloudinaryCloudName = String(runtime.cloudinaryCloudName || build.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  const agoraAppId = String(runtime.agoraAppId || build.VITE_AGORA_APP_ID || "").trim();
  const configured = !missing(supabaseUrl) && !missing(supabaseAnonKey);
  if (configured) {
    let url;
    try { url = new URL(supabaseUrl); } catch { throw new Error("Gunakan HTTPS Supabase URL yang valid."); }
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("Gunakan HTTPS Supabase URL yang valid.");
    }
  }
  return { supabaseUrl, supabaseAnonKey, apiBaseUrl, livekitUrl, cloudinaryCloudName, agoraAppId, configured };
}
