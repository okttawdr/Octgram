export function authUrls(origin) {
  const base = String(origin).replace(/\/$/, "");
  return { callback: `${base}/auth/callback`, recovery: `${base}/auth/recovery` };
}

export function googleOAuthOptions(origin) {
  return { provider: "google", options: { redirectTo: authUrls(origin).callback } };
}

export function safeNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/auth/")) return "/";
  return value;
}
