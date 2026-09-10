import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".json": "application/json; charset=utf-8" };

export function createStaticHandler(distDir) {
  const root = resolve(distDir);
  return async function serve(request, response, url) {
    if (!new Set(["GET", "HEAD"]).has(request.method || "")) return false;
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return false; }
    const requested = resolve(root, `.${pathname}`);
    if (requested !== root && !requested.startsWith(root + sep)) return false;
    let file = requested;
    try { if (!(await stat(file)).isFile()) throw new Error("not file"); }
    catch {
      if (extname(pathname)) return false;
      file = resolve(root, "index.html");
      try { if (!(await stat(file)).isFile()) return false; } catch { return false; }
    }
    const ext = extname(file).toLowerCase();
    const isRuntimeConfig = file === resolve(root, "config.js");
    response.writeHead(200, {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": isRuntimeConfig ? "no-store" : ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(file).pipe(response);
    return true;
  };
}
