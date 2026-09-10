import assert from "node:assert/strict";
import test from "node:test";
import { routeRequest } from "../server/routes.mjs";

const base = {
  method: "POST",
  pathname: "/api/live",
  searchParams: new URLSearchParams(),
  body: { title: "Tes" },
  user: { id: "11111111-1111-4111-8111-111111111111" },
  cloudinary: null,
  metered: null,
};

test("start live passes provider availability and limits token TTL", async () => {
  let options;
  let rtcArgs;
  const repository = {
    async startLive(title, value) {
      assert.equal(title, "Tes");
      options = value;
      return { id: 7, provider: "agora", room_name: "room", session_minutes: 12, reservation_minutes: 12 };
    },
  };
  const agora = {
    mintRtcToken(args) { rtcArgs = args; return "rtc"; },
    mintRtmToken() { return "rtm"; },
  };
  const result = await routeRequest({ ...base, repository, agora, livekit: null });
  assert.deepEqual(options, { agoraAvailable: true, livekitAvailable: false });
  assert.equal(rtcArgs.ttlSeconds, 720);
  assert.equal(result.data.token, "rtc");
});

test("join live reserves participant minutes before minting a token", async () => {
  let joined;
  const repository = {
    async joinLive(id) {
      joined = id;
      return { id, provider: "livekit", room_name: "room", status: "live", reservation_minutes: 8, host: { id: "host" } };
    },
  };
  const livekit = { async mintToken(args) { assert.equal(args.ttlSeconds, 480); return "lk"; } };
  const result = await routeRequest({ ...base, method: "GET", pathname: "/api/live/9", body: undefined, repository, agora: null, livekit });
  assert.equal(joined, 9);
  assert.equal(result.data.token, "lk");
});

test("TURN endpoint receives configured provider", async () => {
  const metered = { async credentials() { return [{ urls: "turn:test" }]; } };
  const result = await routeRequest({ ...base, method: "GET", pathname: "/api/calls/turn-credentials", body: undefined, repository: {}, agora: null, livekit: null, metered });
  assert.equal(result.data.iceServers[0].urls, "turn:test");
});
