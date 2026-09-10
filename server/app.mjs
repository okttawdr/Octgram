import { authenticate } from "./auth.mjs";
import { HttpError, readJson, sendJson } from "./http.mjs";

const headers = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), microphone=(self), geolocation=()",
};

export function createApp({ config, gateway, livekit, cloudinary, agora, metered, router, staticHandler }) {
  return async function app(request, response) {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { data: { status: "ok", service: "octgram-api" } });
      }
      if (url.pathname === "/api/webhooks/agora" && request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString("utf8");
        const signatures = { v2: request.headers["agora-signature-v2"], v1: request.headers["agora-signature"] };
        if (!agora || !agora.verifyWebhook(raw, signatures)) {
          return sendJson(response, 401, { error: { code: "UNAUTHENTICATED", message: "Signature tidak valid." } });
        }
        let payload = {};
        try { payload = JSON.parse(raw); } catch { /* ignore malformed webhook body */ }
        const channel = payload?.payload?.channelName || payload?.payload?.channel_name || payload?.channelName;
        if (channel) {
          const service = gateway.createServiceClient?.();
          if (service) await service.rpc("reconcile_stream", { room_value: channel }).catch(() => {});
        }
        return sendJson(response, 200, { data: { ok: true } });
      }
      if (url.pathname === "/config.js" && (request.method === "GET" || request.method === "HEAD")) {
        const js = `window.OCTGRAM_CONFIG=${JSON.stringify({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey, apiBaseUrl: "/api", livekitUrl: config.livekitUrl, cloudinaryCloudName: config.cloudinaryCloudName, agoraAppId: config.agoraAppId })};`;
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        return request.method === "HEAD" ? response.end() : response.end(js);
      }
      if (!url.pathname.startsWith("/api/")) {
        if (staticHandler && await staticHandler(request, response, url)) return;
        return sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Halaman tidak ditemukan." } });
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) {
        const origin = request.headers.origin;
        const allowed = config.allowedOrigins || [config.allowedOrigin];
        if (origin && !allowed.includes(origin.replace(/\/$/, ""))) throw new HttpError(403, "ORIGIN_FORBIDDEN", "Origin tidak diizinkan.");
      }
      const { token, user } = await authenticate(request, gateway);
      const body = await readJson(request, config.maxBodyBytes);
      const result = await router({ request, method: request.method || "GET", pathname: url.pathname, searchParams: url.searchParams, body, token, user, livekit, cloudinary, agora, metered, repository: gateway.createRepository?.(token) || gateway.repository });
      if (!result) throw new HttpError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
      return sendJson(response, result.status || 200, "error" in result ? { error: result.error } : { data: result.data });
    } catch (cause) {
      const status = cause instanceof HttpError ? cause.status : cause?.code === "42501" ? 403 : 500;
      const code = cause instanceof HttpError ? cause.code : cause?.code === "42501" ? "FORBIDDEN" : "INTERNAL_ERROR";
      const message = cause instanceof HttpError ? cause.message : cause?.code === "42501" ? String(cause.message || "").split("\n")[0] : "Terjadi kesalahan pada server.";
      return sendJson(response, status, { error: { code, message } });
    }
  };
}
