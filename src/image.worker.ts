// Auto-compression ladder: try progressively smaller/leaner encodes until the
// result fits the storage budget. No user-facing resolution/quality knobs —
// this always picks the best quality that still fits.
const BUDGET_BYTES = 1_048_576; // 1 MB, matches the app-wide storage cap
const LADDER: Array<{ edge: number; quality: number }> = [
  { edge: 1440, quality: 0.82 },
  { edge: 1440, quality: 0.68 },
  { edge: 1080, quality: 0.72 },
  { edge: 1080, quality: 0.56 },
  { edge: 864, quality: 0.6 },
  { edge: 864, quality: 0.44 },
  { edge: 720, quality: 0.5 },
  { edge: 576, quality: 0.42 },
  { edge: 480, quality: 0.36 },
];

self.onmessage = async (
  e: MessageEvent<{
    file: File;
    rotation: number;
    crop: string;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    maxEdge?: number;
  }>,
) => {
  try {
    const { file, rotation, crop, zoom = 1, offsetX = 0, offsetY = 0, maxEdge } = e.data;
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const w = bitmap.width,
      h = bitmap.height;
    if (w * h > 40000000) {
      bitmap.close();
      throw new Error("Foto melebihi 40 megapiksel. Kecilkan resolusi dahulu.");
    }
    const rotated = rotation % 180 !== 0;
    const rw = rotated ? h : w,
      rh = rotated ? w : h;
    const canvas = new OffscreenCanvas(rw, rh);
    const ctx = canvas.getContext("2d")!;
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -w / 2, -h / 2);
    bitmap.close();
    let cw = rw,
      ch = rh;
    const ratio =
      crop === "square"
        ? 1
        : crop === "portrait"
          ? 0.8
          : crop === "landscape"
            ? 1.91
            : rw / rh;
    if (cw / ch > ratio) cw = ch * ratio;
    else ch = cw / ratio;
    const z = Math.min(4, Math.max(1, zoom));
    cw /= z;
    ch /= z;
    const maxOffX = (rw - cw) / 2,
      maxOffY = (rh - ch) / 2;
    const sx = Math.min(rw - cw, Math.max(0, rw / 2 - cw / 2 + offsetX * maxOffX)),
      sy = Math.min(rh - ch, Math.max(0, rh / 2 - ch / 2 + offsetY * maxOffY));

    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const step of LADDER) {
      const edge = maxEdge ? Math.min(step.edge, maxEdge) : step.edge;
      const scale = Math.min(1, edge / Math.max(cw, ch));
      const outW = Math.max(1, Math.round(cw * scale)),
        outH = Math.max(1, Math.round(ch * scale));
      const out = new OffscreenCanvas(outW, outH);
      const oc = out.getContext("2d")!;
      oc.imageSmoothingQuality = "high";
      oc.drawImage(canvas, sx, sy, cw, ch, 0, 0, outW, outH);
      const blob = await out.convertToBlob({ type: "image/webp", quality: step.quality });
      if (blob.type !== "image/webp")
        throw new Error(
          "Browser ini belum mendukung ekspor WebP. Gunakan Chrome, Edge, atau Firefox terbaru.",
        );
      best = { blob, width: outW, height: outH };
      if (blob.size <= BUDGET_BYTES) break;
    }
    self.postMessage(best);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Gagal memproses foto.",
    });
  }
};
