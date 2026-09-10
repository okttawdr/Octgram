import { boolean, integer, invalid, media, object, optionalInteger, string, uuid } from "./validation.mjs";

export async function routeRequest(context) {
  const { method, pathname, searchParams, body, repository: repo, user, livekit, cloudinary, agora, metered } = context;
  if (method === "GET" && pathname === "/api/me") return { data: await repo.me(user.id) };
  if (method === "GET" && pathname === "/api/profiles") {
    const query = (searchParams.get("q") || "").replace(/[^a-z0-9_]/gi, "").toLowerCase();
    return { data: await repo.searchProfiles(string(query, { min: 2, max: 24 })) };
  }
  let match = pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if (method === "GET" && match) return { data: await repo.profile(decodeURIComponent(match[1]), user.id) };
  if (method === "PATCH" && pathname === "/api/me") {
    const value = object(body); const patch = {};
    if (value.username !== undefined) { patch.username = string(value.username, { min: 3, max: 24 }).toLowerCase(); if (!/^[a-z0-9_]+$/.test(patch.username)) throw invalid("Username hanya boleh berisi huruf kecil, angka, dan garis bawah."); }
    if (value.display_name !== undefined) patch.display_name = string(value.display_name, { min: 1, max: 60 });
    if (value.bio !== undefined) patch.bio = string(value.bio, { max: 160 });
    if (value.website !== undefined) { patch.website = string(value.website, { max: 2048 }); if (patch.website && !patch.website.startsWith("https://")) throw invalid("Website harus memakai HTTPS."); }
    if (value.avatar_path !== undefined) patch.avatar_path = value.avatar_path === null ? null : string(value.avatar_path, { min: 42, max: 180 });
    return { data: await repo.updateProfile(user.id, patch) };
  }
  if (method === "GET" && pathname === "/api/feed") {
    const scope = searchParams.get("scope") || "home";
    if (!new Set(["home", "explore", "saved", "profile"]).has(scope)) throw invalid();
    return { data: await repo.feed(scope, optionalInteger(searchParams.get("beforeId")), searchParams.get("authorId")) };
  }
  if (method === "POST" && pathname === "/api/posts") {
  const value = object(body);
  const postMedia = media(value.media);
  const thumbnailIndex = integer(value.thumbnailIndex ?? 0, { min: 0 });

  if (thumbnailIndex >= postMedia.length) {
    throw invalid("Thumbnail tidak valid.");
  }

  return {
    status: 201,
    data: await repo.publishPost(
      string(value.caption ?? "", { max: 2200 }),
      postMedia,
      uuid(value.requestId),
      thumbnailIndex,
    ),
  };
}
  match = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (method === "GET" && match) return { data: await repo.post(integer(match[1]), user.id) };
  match = pathname.match(/^\/api\/posts\/(\d+)\/comments$/);
  if (method === "GET" && match) return { data: await repo.comments(integer(match[1]), optionalInteger(searchParams.get("beforeId"))) };
  if (method === "POST" && match) { const value = object(body); return { status: 201, data: await repo.addComment(integer(match[1]), string(value.body, { min: 1, max: 1000 }), value.parentId == null ? null : integer(value.parentId)) }; }
  match = pathname.match(/^\/api\/posts\/(\d+)\/(like|bookmark)$/);
  if (method === "POST" && match) { const enabled = boolean(object(body).enabled); await (match[2] === "like" ? repo.setLike(integer(match[1]), enabled) : repo.setBookmark(integer(match[1]), enabled)); return { data: null }; }
  match = pathname.match(/^\/api\/follows\/([0-9a-f-]+)$/i);
  if (method === "POST" && match) { await repo.setFollow(uuid(match[1]), boolean(object(body).enabled)); return { data: null }; }
  if (method === "GET" && pathname === "/api/notifications") return { data: await repo.notifications(optionalInteger(searchParams.get("beforeId"))) };
  if (method === "PATCH" && pathname === "/api/notifications") { const value = object(body); await repo.markNotificationsRead(value.id == null ? null : integer(value.id)); return { data: null }; }
  if (method === "GET" && pathname === "/api/conversations") return { data: await repo.conversations(searchParams.get("beforeUpdated"), searchParams.get("beforeId")) };
  if (method === "POST" && pathname === "/api/conversations") return { status: 201, data: await repo.startChat(uuid(object(body).userId)) };
  match = pathname.match(/^\/api\/conversations\/([0-9a-f-]+)$/i);
  if (method === "GET" && match) return { data: await repo.conversation(uuid(match[1])) };
  match = pathname.match(/^\/api\/conversations\/([0-9a-f-]+)\/messages$/i);
  if (method === "GET" && match) return { data: await repo.messages(uuid(match[1]), optionalInteger(searchParams.get("beforeId"))) };
  if (method === "POST" && match) { const value = object(body); return { status: 201, data: await repo.sendMessage(uuid(match[1]), string(value.body, { min: 1, max: 2000 }), uuid(value.requestId)) }; }
  if (method === "GET" && pathname === "/api/live") {
    return { data: await repo.liveFeed() };
  }
  if (method === "POST" && pathname === "/api/live") {
    if (!agora && !livekit) throw invalid("Livestreaming belum dikonfigurasi di server.");
    const value = object(body);
    const stream = await repo.startLive(string(value.title ?? "", { max: 100 }), { agoraAvailable: Boolean(agora), livekitAvailable: Boolean(livekit) });
    const ttlSeconds = Math.max(60, Number(stream.reservation_minutes || stream.session_minutes || 1) * 60);
    const token = stream.provider === "agora" && agora
      ? agora.mintRtcToken({ channel: stream.room_name, uid: user.id, publisher: true, ttlSeconds })
      : livekit ? await livekit.mintToken({ identity: user.id, name: user.id, room: stream.room_name, canPublish: true, ttlSeconds }) : null;
    const chatToken = stream.provider === "agora" && agora ? agora.mintRtmToken({ uid: user.id, ttlSeconds }) : null;
    return { status: 201, data: { ...stream, token, chat_token: chatToken } };
  }
  match = pathname.match(/^\/api\/live\/(\d+)$/);
  if (method === "GET" && match) {
    const stream = await repo.joinLive(integer(match[1]));
    if (!stream) throw invalid("Live tidak ditemukan.");
    const isHost = stream.host.id === user.id;
    const live = stream.status === "live";
    const ttlSeconds = Math.max(60, Number(stream.reservation_minutes || 1) * 60);
    let token = null, chatToken = null;
    if (live && stream.provider === "agora" && agora) {
      token = agora.mintRtcToken({ channel: stream.room_name, uid: user.id, publisher: isHost, ttlSeconds });
      chatToken = agora.mintRtmToken({ uid: user.id, ttlSeconds });
    } else if (live && stream.provider === "livekit" && livekit) {
      token = await livekit.mintToken({ identity: user.id, name: user.id, room: stream.room_name, canPublish: isHost, ttlSeconds });
    } else if (live) {
      throw invalid("Live sedang tidak tersedia saat ini. Coba lagi nanti.");
    }
    return { data: { ...stream, token, chat_token: chatToken, is_host: isHost } };
  }
  if (method === "DELETE" && match) {
    const stream = await repo.endLive(integer(match[1]));
    if (stream?.provider === "livekit" && livekit) await livekit.closeRoom(stream.room_name);
    return { data: null };
  }
  if (method === "GET" && pathname === "/api/calls/turn-credentials") {
    if (!metered) return { data: { iceServers: [] } };
    return { data: { iceServers: await metered.credentials() } };
  }
  if (method === "POST" && pathname === "/api/uploads/sign") {
    if (!cloudinary) throw invalid("Cloudinary belum dikonfigurasi di server (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET).");
    const value = object(body);
    const itemId = string(value.itemId ?? "", { min: 1, max: 64 }).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!itemId) throw invalid("itemId tidak valid.");
    return { data: cloudinary.signUpload({ userId: user.id, itemId }) };
  }
  if (method === "DELETE" && pathname === "/api/uploads") {
    if (!cloudinary) throw invalid("Cloudinary belum dikonfigurasi di server.");
    const value = object(body);
    const publicId = string(value.publicId ?? "", { min: 1, max: 200 });
    if (!publicId.startsWith(`octgram/posts/${user.id}_`)) throw invalid("Tidak berwenang.");
    await cloudinary.destroy(publicId);
    return { data: null };
  }
  return null;
}
