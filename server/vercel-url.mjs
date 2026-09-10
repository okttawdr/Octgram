export function restoreVercelUrl(value = "/") {
  const url = new URL(value, "http://localhost");
  if (url.searchParams.has("__config")) return "/config.js";
  const path = url.searchParams.get("__path");
  if (path === null) return `${url.pathname}${url.search}`;
  url.searchParams.delete("__path");
  const query = url.searchParams.toString();
  return `/api/${path.replace(/^\/+/, "")}${query ? `?${query}` : ""}`;
}
