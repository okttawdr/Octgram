import { createApp } from "../server/app.mjs";
import { createAgora } from "../server/agora.mjs";
import { createCloudinary } from "../server/cloudinary.mjs";
import { loadServerConfig } from "../server/config.mjs";
import { createLiveKit } from "../server/livekit.mjs";
import { createMetered } from "../server/metered.mjs";
import { routeRequest } from "../server/routes.mjs";
import { createSupabaseGateway } from "../server/supabase.mjs";
import { restoreVercelUrl } from "../server/vercel-url.mjs";

const serverConfig = loadServerConfig();
const gateway = createSupabaseGateway(serverConfig);
const app = createApp({
  config: serverConfig,
  gateway,
  livekit: createLiveKit(serverConfig),
  cloudinary: createCloudinary(serverConfig),
  agora: createAgora(serverConfig),
  metered: createMetered(serverConfig),
  router: routeRequest,
  staticHandler: null,
});

export default function handler(request, response) {
  request.url = restoreVercelUrl(request.url);
  return app(request, response);
}

export const config = { api: { bodyParser: false } };
