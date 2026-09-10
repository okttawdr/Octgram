import { createServer } from "node:http";
import { createApp } from "./app.mjs";
import { loadServerConfig } from "./config.mjs";
import { createSupabaseGateway } from "./supabase.mjs";
import { routeRequest } from "./routes.mjs";
import { createStaticHandler } from "./static.mjs";
import { createLiveKit } from "./livekit.mjs";
import { createCloudinary } from "./cloudinary.mjs";
import { createAgora } from "./agora.mjs";
import { createMetered } from "./metered.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

try { if (process.loadEnvFile) process.loadEnvFile(".env"); } catch {}

const config = loadServerConfig();
const gateway = createSupabaseGateway(config);
const livekit = createLiveKit(config);
const cloudinary = createCloudinary(config);
const agora = createAgora(config);
const metered = createMetered(config);
const dist = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
const server = createServer(createApp({ config, gateway, livekit, cloudinary, agora, metered, router: routeRequest, staticHandler: createStaticHandler(dist) }));
server.listen(config.port, config.host, () => console.log(`Octgram listening on http://${config.host}:${config.port}`));

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
