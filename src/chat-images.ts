// Kompresi HEAVY khusus gambar chat: target jauh lebih kecil dari foto post.
// Post memakai budget ~1 MB; chat memakai budget ~350 KB + edge maksimal 1080
// agar terkirim cepat di HP dan hemat kredit Cloudinary.
const CHAT_BUDGET = 350 * 1024;
const CHAT_LADDER = [
  { edge: 1080, quality: 0.68 },
  { edge: 1080, quality: 0.55 },
  { edge: 864, quality: 0.55 },
  { edge: 864, quality: 0.42 },
  { edge: 720, quality: 0.45 },
  { edge: 640, quality: 0.4 },
  { edge: 480, quality: 0.38 },
];

export async function compressChatImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Gunakan JPG, PNG, atau WebP.");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 20 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error("Gambar tidak bisa dibaca.");
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error("Gambar melebihi 40 megapiksel.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung kompresi gambar.");
    ctx.drawImage(bitmap, 0, 0);
    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const step of CHAT_LADDER) {
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
      const blob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, "image/webp", step.quality));
      if (!blob) continue;
      best = { blob, width: outW, height: outH };
      if (blob.size <= CHAT_BUDGET) break;
    }
    if (!best) throw new Error("Gagal memadatkan gambar.");
    return best;
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
    form.append("transformation", "f_auto,q_auto:low,fl_strip_profile");
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
