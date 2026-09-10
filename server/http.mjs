export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function bearerToken(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function readJson(request, limit = 262_144) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) return undefined;
  const length = Number(request.headers["content-length"] || 0);
  if (request.headers["content-length"] === "0") return undefined;
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan Content-Type application/json.");
  }
  if (length > limit) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Ukuran request terlalu besar.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Ukuran request terlalu besar.");
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "INVALID_JSON", "Body JSON tidak valid."); }
}
