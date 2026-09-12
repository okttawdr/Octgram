import { runtimeConfig } from "../config";
import type { Comment, Conversation, LiveJoin, LiveStream, Media, Message, Notification, PersonEntry, Post, Profile, ProfileDetails } from "../domain/types";
import { supabase } from "./supabase";
import { apiUrl } from "./api-core.mjs";

type Options = { method?: string; body?: unknown; query?: Record<string, unknown>; signal?: AbortSignal };
type ApiFailure = { error?: { code?: string; message?: string } };

async function request<T>(path: string, options: Options = {}, retry = true): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesi tidak tersedia. Silakan masuk kembali.");
  const response = await fetch(apiUrl(path, options.query, runtimeConfig.apiBaseUrl), {
    method: options.method || "GET",
    signal: options.signal,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 401 && retry) {
    const { error } = await supabase.auth.refreshSession();
    if (!error) return request<T>(path, options, false);
  }
  const payload = await response.json() as { data?: T } & ApiFailure;
  if (!response.ok) throw new Error(payload.error?.message || `Request gagal (${response.status}).`);
  return payload.data as T;
}

export const api = {
  me: () => request<Profile>("/me"),
  searchProfiles: (q: string) => request<Profile[]>("/profiles", { query: { q } }),
  profile: (username: string) => request<ProfileDetails>(`/profiles/${encodeURIComponent(username)}`),
  updateProfile: (value: Partial<Profile>) => request<Profile>("/me", { method: "PATCH", body: value }),
  feed: (scope: "home" | "explore" | "saved" | "profile" | "archived", beforeId?: number, authorId?: string) => request<Post[]>("/feed", { query: { scope, beforeId, authorId } }),
  post: (id: number) => request<Post>(`/posts/${id}`),
  comments: (postId: number, beforeId?: number) => request<Comment[]>(`/posts/${postId}/comments`, { query: { beforeId } }),
  publishPost: (caption: string, media: Media[], requestId: string, thumbnailIndex = 0, collabUsername?: string) => request<number>("/posts", { method: "POST", body: { caption, media, requestId, thumbnailIndex, collabUsername: collabUsername || null } }),
  editPost: (postId: number, opts?: { caption?: string | null; thumbnailIndex?: number | null }) => request<Post>(`/posts/${postId}`, { method: "POST", body: { caption: opts?.caption ?? null, thumbnailIndex: opts?.thumbnailIndex ?? null } }),
  archivePost: (postId: number, enabled: boolean) => request<null>(`/posts/${postId}/archive`, { method: "POST", body: { enabled } }),
  deletePost: (postId: number) => request<null>(`/posts/${postId}`, { method: "DELETE" }),
  setRepost: (postId: number, enabled: boolean) => request<null>(`/posts/${postId}/repost`, { method: "POST", body: { enabled } }),
  postLikes: (postId: number) => request<PersonEntry[]>(`/posts/${postId}/likes`),
  postReposters: (postId: number) => request<PersonEntry[]>(`/posts/${postId}/reposters`),
  followList: (username: string, kind: "followers" | "following") => request<PersonEntry[]>(`/profiles/${encodeURIComponent(username)}/${kind}`),
  dbStats: () => request<Record<string, unknown>>("/db-stats"),
  addComment: (postId: number, body: string, parentId: number | null) => request<number>(`/posts/${postId}/comments`, { method: "POST", body: { body, parentId } }),
  setLike: (postId: number, enabled: boolean) => request<null>(`/posts/${postId}/like`, { method: "POST", body: { enabled } }),
  setBookmark: (postId: number, enabled: boolean) => request<null>(`/posts/${postId}/bookmark`, { method: "POST", body: { enabled } }),
  setFollow: (profileId: string, enabled: boolean) => request<null>(`/follows/${profileId}`, { method: "POST", body: { enabled } }),
  notifications: (beforeId?: number) => request<Notification[]>("/notifications", { query: { beforeId } }),
  markNotificationsRead: (id?: number) => request<null>("/notifications", { method: "PATCH", body: { id: id ?? null } }),
  conversations: (beforeUpdated?: string, beforeId?: string) => request<Conversation[]>("/conversations", { query: { beforeUpdated, beforeId } }),
  conversation: (id: string) => request<Conversation>(`/conversations/${id}`),
  startChat: (userId: string) => request<string>("/conversations", { method: "POST", body: { userId } }),
  messages: (conversationId: string, beforeId?: number) => request<Message[]>(`/conversations/${conversationId}/messages`, { query: { beforeId } }),
  sendMessage: (conversationId: string, body: string, requestId: string, opts?: { mediaPath?: string | null; mediaType?: "image" | "video" | null; viewOnce?: boolean; replyTo?: number | null }) => request<Message>(`/conversations/${conversationId}/messages`, { method: "POST", body: { body, requestId, mediaPath: opts?.mediaPath ?? null, mediaType: opts?.mediaType ?? null, viewOnce: opts?.viewOnce ?? false, replyTo: opts?.replyTo ?? null } }),
  openOnceMedia: (messageId: number) => request<{ path: string; type: "image" | "video" }>(`/messages/${messageId}/media/open`, { method: "POST" }),
  finishOnceMedia: (messageId: number) => request<null>(`/messages/${messageId}/media/finish`, { method: "DELETE" }),
  liveFeed: () => request<LiveStream[]>("/live"),
  goLive: (title: string) => request<LiveJoin>("/live", { method: "POST", body: { title } }),
  joinLive: (id: number) => request<LiveJoin>(`/live/${id}`),
  endLive: (id: number) => request<null>(`/live/${id}`, { method: "DELETE" }),
  turnCredentials: () => request<{ iceServers: RTCIceServer[] }>("/calls/turn-credentials"),
  signUpload: (itemId: string, kind = "post") => request<{ cloudName: string; apiKey: string; timestamp: number; signature: string; publicId: string; folder: string; kind: string }>("/uploads/sign", { method: "POST", body: { itemId, kind } }),
  deleteUpload: (publicId: string) => request<null>("/uploads", { method: "DELETE", body: { publicId } }),
};
