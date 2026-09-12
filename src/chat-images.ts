import { db } from "./lib";

// Kompresi HEAVY khusus gambar chat: target jauh lebih kecil dari foto post.
// Sekarang memakai AVIF (jauh lebih efisien dari WebP pada kualitas yang sama),
// dengan fallback otomatis ke WebP untuk browser yang belum bisa meng-encode AVIF.
// Budget diperkecil karena AVIF bisa mencapai kualitas serupa di ukuran lebih kecil.
const CHAT_BUDGET = 220 * 1024;
const CHAT_LADDER_AVIF = [
  { edge: 1080, quality: 0.5 },
  { edge: 1080, quality: 0.38 },
  { edge: 864, quality: 0.38 },
  { edge: 864, quality: 0.28 },
  { edge: 720, quality: 0.3 },
  { edge: 640, quality: 0.26 },
  { edge: 480, quality: 0.24 },
];
const CHAT_LADDER_WEBP = [
  { edge: 1080, quality: 0.68 },
  { edge: 1080, quality: 0.55 },
  { edge: 864, quality: 0.55 },
  { edge: 864, quality: 0.42 },
  { edge: 720, quality: 0.45 },
  { edge: 640, quality: 0.4 },
  { edge: 480, quality: 0.38 },
];

let avifSupportCache: Promise<boolean> | null = null;

// Deteksi apakah browser ini bisa MENG-ENCODE (bukan cuma decode) AVIF lewat canvas.
// Chrome/Edge modern bisa; browser yang belum dukung akan otomatis fallback ke WebP.
function canEncodeAvif(): Promise<boolean> {
  if (avifSupportCache) return avifSupportCache;
  avifSupportCache = new Promise((resolve) => {
    try {
      const probe = document.createElement("canvas");
      probe.width = 2;
      probe.height = 2;
      probe.toBlob((blob) => resolve(!!blob && blob.type === "image/avif"), "image/avif", 0.5);
    } catch {
      resolve(false);
    }
  });
  return avifSupportCache;
}

export async function compressChatImage(file: File): Promise<{ blob: Blob; width: number; height: number; extension: "avif" | "webp"; mime: string }> {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
    throw new Error("Gunakan JPG, PNG, WebP, atau AVIF.");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 20 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error("Gambar tidak bisa dibaca.");
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error("Gambar melebihi 40 megapiksel.");
    const useAvif = await canEncodeAvif();
    const mime = useAvif ? "image/avif" : "image/webp";
    const extension: "avif" | "webp" = useAvif ? "avif" : "webp";
    const ladder = useAvif ? CHAT_LADDER_AVIF : CHAT_LADDER_WEBP;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung kompresi gambar.");
    ctx.drawImage(bitmap, 0, 0);
    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const step of ladder) {
      const scale = Math.min(1, step.edge / Math.max(canvas.width, canvas.height));
      const outW = Math.max(1, Math.round(canvas.width * scale));
      const outH = Math.max(1, Math.round(canvas.height * scale));
      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const octx = out.getContext("2d");
      if (!octx) continue;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(canvas, 0, 0, outW, outH);
      const blob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, mime, step.quality));
      if (!blob) continue;
      best = { blob, width: outW, height: outH };
      if (blob.size <= CHAT_BUDGET) break;
    }
    if (!best) throw new Error("Gagal memadatkan gambar.");
    return { ...best, extension, mime };
  } finally {
    bitmap.close();
  }
}

export function uploadChatImage(
  sign: { cloudName: string; apiKey: string; timestamp: number; signature: string; publicId: string; folder: string },
  blob: Blob,
  onProgress: (n: number) => void,
): Promise<{ public_id: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Kompresi berat ganda: client sudah padatkan, Cloudinary diminta exif-strip + q_auto:low.
    form.append("file", blob, "chat.webp");
    form.append("api_key", sign.apiKey);
    form.append("timestamp", String(sign.timestamp));
    form.append("signature", sign.signature);
    form.append("public_id", sign.publicId);
    form.append("folder", sign.folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Respons upload tidak valid."));
        }
      } else reject(new Error("Upload gambar gagal. Coba lagi."));
    };
    xhr.onerror = () => reject(new Error("Jaringan terputus. Coba lagi."));
    xhr.send(form);
  });
}

// Media chat sekarang PERMANEN (bukan sekali lihat): tersimpan terus di percakapan.
// Sebelum masuk storage/DB, gambar selalu dikonversi dulu ke AVIF (fallback WebP
// bila browser belum bisa encode AVIF) supaya ukurannya jauh lebih kecil.
export async function prepareChatMedia(file: File): Promise<{ blob: Blob; type: "image" | "video"; extension: "avif" | "webp" | "mp4" | "webm"; mime: string }> {
  if (file.type.startsWith("image/")) {
    const packed = await compressChatImage(file);
    return { blob: packed.blob, type: "image", extension: packed.extension, mime: packed.mime };
  }
  if (!new Set(["video/mp4", "video/webm"]).has(file.type)) throw new Error("Gunakan foto JPG, PNG, WebP/AVIF, atau video MP4/WebM.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Ukuran video maksimal 25 MB.");
  return { blob: file, type: "video", extension: file.type === "video/webm" ? "webm" : "mp4", mime: file.type };
}

// Alias lama dipertahankan agar kompatibel bila masih dirujuk di tempat lain.
export const prepareOnceMedia = prepareChatMedia;

export async function uploadChatMedia(path: string, blob: Blob, contentType: string): Promise<void> {
  // cacheControl panjang: media ini permanen, aman di-cache lama oleh CDN/browser.
  const { error } = await db.storage.from("chat-once").upload(path, blob, { cacheControl: "31536000", contentType, upsert: false });
  if (error) throw error;
}

export const uploadOnceMedia = uploadChatMedia;
