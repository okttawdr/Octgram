export function apiUrl(path, query = {}, base = "/api") {
  const cleanBase = String(base || "/api").replace(/\/$/, "");
  const cleanPath = String(path).startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  const suffix = params.toString();
  return `${cleanBase}${cleanPath}${suffix ? `?${suffix}` : ""}`;
}
