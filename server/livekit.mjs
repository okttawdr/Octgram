import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// Thin wrapper around LiveKit: mints join tokens and reads live participant
// counts. Returns null when LIVEKIT_* env vars are not set, so the rest of
// the app can degrade gracefully instead of crashing on boot.
export function createLiveKit(config) {
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) return null;
  const roomService = new RoomServiceClient(config.livekitUrl, config.livekitApiKey, config.livekitApiSecret);
  return {
    async mintToken({ identity, name, room, canPublish, ttlSeconds = 3600 }) {
      const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, { identity, name, ttl: `${Math.max(60, ttlSeconds)}s` });
      at.addGrant({ room, roomJoin: true, canPublish, canPublishData: true, canSubscribe: true, canUpdateOwnMetadata: true });
      return at.toJwt();
    },
    async participantCount(room) {
      try { return (await roomService.listParticipants(room)).length; } catch { return 0; }
    },
    async closeRoom(room) {
      try { await roomService.deleteRoom(room); } catch { /* room may already be empty/gone */ }
    },
  };
}
