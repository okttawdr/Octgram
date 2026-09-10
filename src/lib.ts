import { runtimeConfig, configured } from "./config";
import { supabase } from "./services/supabase";
export type { Profile, Post, Comment, Notification, Conversation, Message, Media } from "./domain/types";

export const db = supabase;
export const supabaseUrl = runtimeConfig.supabaseUrl;
export const supabaseKey = runtimeConfig.supabaseAnonKey;
export const cloudinaryCloudName = runtimeConfig.cloudinaryCloudName;
export { configured };

export function photo(path: string): string {
  return db.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// Post media lives on Cloudinary (path is the Cloudinary public_id).
// f_auto/q_auto lets Cloudinary pick the best format (AVIF/WebP) and quality
// per visitor automatically — extra bandwidth savings on top of our own
// pre-upload compression, at no extra storage cost (transformed on the fly).
export function mediaUrl(path: string, width?: number): string {
  const transform = width ? `f_auto,q_auto,w_${width}` : "f_auto,q_auto";
  return `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/${transform}/${path}`;
}

export function invalidateFeed(): void {}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String(error.message)
      : "Terjadi kesalahan. Silakan coba lagi.";
}

export function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

export function date(input: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(input));
}

export function go(path: string): void {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}
