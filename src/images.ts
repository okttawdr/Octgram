import { db, supabaseUrl, supabaseKey } from "./lib";
export type ProcessOptions = {
  rotation: number;
  crop: string;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  maxEdge?: number;
};
export function processImage(
  file: File,
  options: ProcessOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return reject(new Error("Gunakan JPG, PNG, atau WebP statis."));
    if (file.size > 20 * 1024 * 1024)
      return reject(new Error("Ukuran sumber maksimal 20 MB."));
    const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
      type: "module",
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Pemrosesan terlalu lama. Coba foto lebih kecil."));
    }, 90000);
    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error("Pemrosesan gambar gagal. Coba browser terbaru."));
    };
    worker.postMessage({ file, ...options });
  });
}
export async function uploadImage(
  path: string,
  blob: Blob,
  onProgress: (n: number) => void,
) {
  if (blob.size > 1.5 * 1024 * 1024)
    throw new Error("Hasil kompresi foto ini masih terlalu besar. Coba foto lain.");
  const {
    data: { session },
    error,
  } = await db.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Sesi berakhir. Masuk kembali.");
  // A retry can reuse a fully uploaded object without sending the bytes again.
  const parts = path.split("/");
  const existing = await db.storage
    .from("photos")
    .list(parts[0], { search: parts[1], limit: 1 });
  if (existing.data?.some((f) => f.name === parts[1])) {
    onProgress(100);
    return;
  }
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/photos/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", "image/webp");
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let msg = "Upload gagal (" + xhr.status + "). Coba lagi.";
        try {
          msg = JSON.parse(xhr.responseText).message || msg;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Jaringan terputus. Coba lagi."));
    xhr.ontimeout = () =>
      reject(new Error("Upload kehabisan waktu. Coba lagi."));
    xhr.send(blob);
  });
}
