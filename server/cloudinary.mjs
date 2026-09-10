import { createHash } from "node:crypto";

// Signed uploads: the browser never sees CLOUDINARY_API_SECRET. The server
// signs a short-lived request (public_id scoped to the requesting user),
// the browser uploads directly to Cloudinary with that signature.
export function createCloudinary(config) {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) return null;
  const { cloudinaryCloudName: cloud, cloudinaryApiKey: apiKey, cloudinaryApiSecret: apiSecret } = config;
  const sign = (params) => createHash("sha1").update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&") + apiSecret).digest("hex");
  return {
    cloudName: cloud,
    apiKey,
    signUpload({ userId, itemId }) {
      const timestamp = Math.floor(Date.now() / 1000);
      const publicId = `${userId}_${itemId}`;
      const folder = "octgram/posts";
      const signature = sign({ folder, public_id: publicId, timestamp });
      return { cloudName: cloud, apiKey, timestamp, signature, publicId, folder };
    },
    async destroy(publicId) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = sign({ public_id: publicId, timestamp });
      try {
        await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ public_id: publicId, api_key: apiKey, timestamp: String(timestamp), signature }),
        });
      } catch { /* best-effort cleanup, ignore failures */ }
    },
  };
}
