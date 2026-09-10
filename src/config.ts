import { resolvePublicConfig, type PublicConfigInput } from "./config-core.mjs";
declare global { interface Window { OCTGRAM_CONFIG?: PublicConfigInput } }
export const runtimeConfig = resolvePublicConfig(window.OCTGRAM_CONFIG, import.meta.env);
export const configured = runtimeConfig.configured;
export const livekitUrl = runtimeConfig.livekitUrl;
export const cloudinaryCloudName = runtimeConfig.cloudinaryCloudName;
export const agoraAppId = runtimeConfig.agoraAppId;
