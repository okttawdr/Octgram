const unwrap = ({ data, error }) => { if (error) throw error; return data; };

async function withReplies(db, rows) {
  const ids = [...new Set((rows || []).map((r) => r.reply_to).filter(Boolean))];
  if (!ids.length) return (rows || []).map((r) => ({ ...r, reply: null }));
  const parents = unwrap(await db.from("messages").select("id,sender_id,body,image_path,media_type,media_once").in("id", ids));
  const byId = new Map(parents.map((p) => [p.id, p]));
  return (rows || []).map((r) => ({ ...r, reply: r.reply_to ? byId.get(r.reply_to) || null : null }));
}

export function createRepository(db) {
  return {
    me: async (id) => { const [profile, followers] = await Promise.all([db.from("profiles").select("id,username,display_name,bio,website,avatar_path").eq("id", id).single(), db.from("follows").select("*", { count: "exact", head: true }).eq("following_id", id)]); if (profile.error) throw profile.error; return { ...profile.data, follower_count: followers.count || 0 }; },
    searchProfiles: async (query) => unwrap(await db.from("profiles").select("id,username,display_name,avatar_path").ilike("username", query.replace(/[^a-z0-9_]/gi, "").toLowerCase() + "%").order("username").limit(20)),
    async profile(username, viewerId) {
      const profile = unwrap(await db.from("profiles").select("id,username,display_name,bio,website,avatar_path").eq("username", username.toLowerCase()).single());
      const [followers, following, posts, relation] = await Promise.all([
        db.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
        db.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
        db.from("posts").select("*", { count: "exact", head: true }).eq("user_id", profile.id).eq("archived", false),
        db.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", profile.id).maybeSingle(),
      ]);
      [followers, following, posts, relation].forEach((result) => { if (result.error) throw result.error; });
      return { ...profile, follower_count: followers.count || 0, following_count: following.count || 0, post_count: posts.count || 0, is_following: Boolean(relation.data) };
    },
    updateProfile: async (id, value) => unwrap(await db.from("profiles").update(value).eq("id", id).select("id,username,display_name,bio,website,avatar_path").single()),
    feed: async (scope, beforeId, authorId) => unwrap(await db.rpc(scope === "explore" ? "explore_feed" : scope === "saved" ? "saved_feed" : scope === "archived" ? "archived_feed" : "feed", scope === "home" || scope === "profile" ? { before_id: beforeId, author_id: authorId || null } : { before_id: beforeId })),
    async post(id, viewerId) {
      const post = unwrap(await db.from("posts").select("id,user_id,caption,media,thumbnail_index,created_at,updated_at,author:profiles!posts_user_id_fkey(id,username,display_name,avatar_path)").eq("id", id).single());
      const [likes, comments, liked, bookmarked, reposts, reposted] = await Promise.all([
        db.from("likes").select("*", { count: "exact", head: true }).eq("post_id", id), db.from("comments").select("*", { count: "exact", head: true }).eq("post_id", id),
        db.from("likes").select("user_id").eq("post_id", id).eq("user_id", viewerId).maybeSingle(), db.from("bookmarks").select("user_id").eq("post_id", id).eq("user_id", viewerId).maybeSingle(),
        db.from("reposts").select("*", { count: "exact", head: true }).eq("post_id", id), db.from("reposts").select("user_id").eq("post_id", id).eq("user_id", viewerId).maybeSingle(),
      ]);
      [likes, comments, liked, bookmarked, reposts, reposted].forEach((result) => { if (result.error) throw result.error; });
      const collabs = unwrap(await db.from("post_collabs").select("user:profiles!post_collabs_user_id_fkey(id,username,display_name,avatar_path)").eq("post_id", id));
      return { ...post, collaborators: (collabs || []).map((c) => c.user), like_count: likes.count || 0, comment_count: comments.count || 0, repost_count: reposts.count || 0, reposted: Boolean(reposted.data), liked: Boolean(liked.data), bookmarked: Boolean(bookmarked.data) };
    },
    comments: async (postId, beforeId) => { let q = db.from("comments").select("id,body,parent_id,created_at,author:profiles!comments_user_id_fkey(id,username,display_name,avatar_path)").eq("post_id", postId).order("id", { ascending: false }).limit(20); if (beforeId) q = q.lt("id", beforeId); return unwrap(await q); },
    publishPost: async (caption, media, requestId, thumbnailIndex, collabUsername) => unwrap(await db.rpc("publish_post", { caption_value: caption, media_value: media, request_id: requestId, thumbnail_value: thumbnailIndex || 0, collab_username: collabUsername || null })),
    editPost: async (postId, caption, thumbnailIndex) => unwrap(await db.rpc("edit_post", { target: postId, caption_value: caption, thumbnail_value: thumbnailIndex ?? null })),
    archivePost: async (postId, enabled) => unwrap(await db.rpc("archive_post", { target: postId, archived_value: enabled })),
    deletePost: async (postId) => unwrap(await db.rpc("delete_post", { target: postId })),
    setRepost: async (postId, enabled) => unwrap(await db.rpc("set_repost", { target: postId, enabled })),
    postLikes: async (postId) => unwrap(await db.rpc("post_likes", { target: postId })),
    postReposters: async (postId) => unwrap(await db.rpc("post_reposters", { target: postId })),
    async followList(username, kind) {
      const profile = unwrap(await db.from("profiles").select("id").eq("username", username.toLowerCase()).single());
      return unwrap(await db.rpc("follow_list", { target: profile.id, kind_value: kind }));
    },
    dbStats: async () => unwrap(await db.rpc("db_stats")),
    addComment: async (postId, body, parentId) => unwrap(await db.rpc("add_comment", { target: postId, body_value: body, parent_value: parentId })),
    setLike: async (postId, enabled) => unwrap(await db.rpc("set_like", { target: postId, enabled })),
    setBookmark: async (postId, enabled) => unwrap(await db.rpc("set_bookmark", { target: postId, enabled })),
    setFollow: async (profileId, enabled) => unwrap(await db.rpc("set_follow", { target: profileId, enabled })),
    notifications: async (beforeId) => { let q = db.from("notifications").select("id,kind,post_id,read_at,created_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_path)").order("id", { ascending: false }).limit(20); if (beforeId) q = q.lt("id", beforeId); return unwrap(await q); },
    markNotificationsRead: async (id) => { let q = db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); if (id) q = q.eq("id", id); return unwrap(await q); },
    conversations: async (beforeUpdated, beforeId) => { let q = db.from("conversations").select("id,user_a,user_b,updated_at,a:profiles!conversations_user_a_fkey(id,username,display_name,avatar_path),b:profiles!conversations_user_b_fkey(id,username,display_name,avatar_path)").order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(20); if (beforeUpdated && beforeId) q = q.or(`updated_at.lt.${beforeUpdated},and(updated_at.eq.${beforeUpdated},id.lt.${beforeId})`); return unwrap(await q); },
    conversation: async (id) => unwrap(await db.from("conversations").select("id,user_a,user_b,updated_at,a:profiles!conversations_user_a_fkey(id,username,display_name,avatar_path),b:profiles!conversations_user_b_fkey(id,username,display_name,avatar_path)").eq("id", id).single()),
    startChat: async (userId) => unwrap(await db.rpc("start_chat", { target: userId })),
    messages: async (conversationId, beforeId) => { let q = db.from("messages").select("id,conversation_id,sender_id,body,image_path,media_path,media_type,media_once,media_opened_at,reply_to,created_at,client_id").eq("conversation_id", conversationId).order("id", { ascending: false }).limit(30); if (beforeId) q = q.lt("id", beforeId); const rows = unwrap(await q); return withReplies(db, rows); },
    liveFeed: async () => unwrap(await db.rpc("live_feed")),
    liveStream: async (id) => unwrap(await db.rpc("live_stream", { target: id })),
    joinLive: async (id) => unwrap(await db.rpc("join_live", { target: id })),
    startLive: async (title, providers) => unwrap(await db.rpc("start_live", { title_value: title, agora_available: providers.agoraAvailable, livekit_available: providers.livekitAvailable })),
    endLive: async (id) => unwrap(await db.rpc("end_live", { target: id })),
    async sendMessage(conversationId, body, requestId, mediaPath = null, mediaType = null, viewOnce = false, replyTo = null) { const id = unwrap(await db.rpc("send_message", { target: conversationId, body_value: body, request_id: requestId, media_value: mediaPath, media_type_value: mediaType, media_once_value: viewOnce, reply_value: replyTo })); const row = unwrap(await db.from("messages").select("id,conversation_id,sender_id,body,image_path,media_path,media_type,media_once,media_opened_at,reply_to,created_at,client_id").eq("id", id).single()); const [full] = await withReplies(db, [row]); return full || row; },
    openOnceMedia: async (messageId) => unwrap(await db.rpc("open_once_media", { target: messageId })),
    finishOnceMedia: async (messageId) => unwrap(await db.rpc("finish_once_media", { target: messageId })),
  };
}
