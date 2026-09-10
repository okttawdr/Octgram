// Metered.ca free TURN tier (used only as fallback ICE relay for the direct
// browser-to-browser 1-on-1 call; most calls connect peer-to-peer without
// ever touching TURN, so real usage stays far below the free quota).
export function createMetered(config) {
  if (!config.meteredApiKey || !config.meteredDomain) return null;
  return {
    async credentials() {
      const res = await fetch(`https://${config.meteredDomain}.metered.live/api/v1/turn/credentials?apiKey=${config.meteredApiKey}`);
      if (!res.ok) throw new Error("Gagal mengambil kredensial TURN.");
      return res.json();
    },
  };
}
