import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  RotateCw,
  ArrowLeft,
  Check,
  UploadCloud,
  Trash2,
} from "lucide-react";
import { processImage, type ProcessOptions } from "./images";
import { errorText, formatBytes, go, type Media } from "./lib";
import { api } from "./services/api";
import { ErrorBox } from "./ui";
type Item = {
  id: string;
  file: File;
  url: string;
  blob?: Blob;
  width?: number;
  height?: number;
  publicId?: string;
  progress: number;
  options: ProcessOptions;
};
const defaults: ProcessOptions = {
  rotation: 0,
  crop: "original",
};
export default function Composer({ uid, followerCount }: { uid: string; followerCount: number }) {
  const maxItems = followerCount >= 100 ? 20 : 8;
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState(0);
  const [thumbnail, setThumbnail] = useState(0);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const latest = useRef(items);
  latest.current = items;
  const published = useRef(false);
  const request = useRef(crypto.randomUUID());
  useEffect(
    () => () => {
      latest.current.forEach((i) => URL.revokeObjectURL(i.url));
      if (!published.current) {
        latest.current
          .filter((i) => i.publicId)
          .forEach((i) => void api.deleteUpload(i.publicId!).catch(() => {}));
      }
    },
    [],
  );
  function patch(id: string, p: Partial<Item>) {
    setItems((old) => old.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }
  async function add(files: FileList | null) {
    if (!files) return;
    setError("");
    if (files.length + items.length > maxItems) {
      setError(`Maksimal ${maxItems} foto dalam satu postingan.`);
      return;
    }
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      ) {
        setError(
          "Gunakan JPG, PNG, atau WebP statis, maksimal 20 MB per sumber.",
        );
        return;
      }
      const id = crypto.randomUUID();
      next.push({
        id,
        file,
        url: URL.createObjectURL(file),
        progress: 0,
        options: { ...defaults },
      });
    }
    setItems((old) => [...old, ...next]);
  }
  async function prepare(item: Item) {
    const result = await processImage(item.file, item.options);
    
    const url = URL.createObjectURL(result.blob);
    URL.revokeObjectURL(item.url);
    const next = { ...item, ...result, url };
    patch(item.id, next);
    return next;
  }
  async function preview() {
    setBusy(true);
    setError("");
    setStage("Memproses foto…");
    try {
      await prepare(items[selected]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const media: Media[] = [];
      for (let index = 0; index < items.length; index++) {
        let item = items[index];
        setStage(`Menyiapkan foto ${index + 1}/${items.length}…`);
        if (!item.blob) item = await prepare(item);
        setStage(`Mengunggah foto ${index + 1}/${items.length}…`);
        if (!item.publicId) {
          const sign = await api.signUpload(item.id);
          if (!sign || !sign.signature || !sign.cloudName) throw new Error("Tidak dapat mengunggah foto: Cloudinary belum dikonfigurasi di server.");
          const uploaded = await new Promise<{ public_id: string; width: number; height: number; bytes: number }>((resolve, reject) => {
            const form = new FormData();
            form.append("file", item.blob!, "photo.webp");
            form.append("api_key", sign.apiKey);
            form.append("timestamp", String(sign.timestamp));
            form.append("signature", sign.signature);
            form.append("public_id", sign.publicId);
            form.append("folder", sign.folder);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) patch(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
              else reject(new Error("Upload foto gagal. Coba lagi."));
            };
            xhr.onerror = () => reject(new Error("Jaringan terputus. Coba lagi."));
            xhr.send(form);
          });
          item = { ...item, publicId: uploaded.public_id, progress: 100 };
          patch(item.id, { publicId: uploaded.public_id, progress: 100 });
        }
        media.push({
          path: item.publicId!,
          width: item.width!,
          height: item.height!,
          bytes: item.blob!.size,
        });
      }
      setStage("Menerbitkan postingan…");
      await api.publishPost(caption, media, request.current, thumbnail);
      published.current = true;
      go("/");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  const item = items[selected];
  return (
    <div className="composer">
      <header className="page-title">
        <div>
          <p className="eyebrow">BAGIKAN MOMENMU</p>
          <h1>Postingan baru</h1>
        </div>
        <button disabled={busy} onClick={() => go("/")}>
          <ArrowLeft size={18} />
          Kembali
        </button>
      </header>
      <div className="compose-grid">
        <section className="panel">
          <div className="editor-preview">
            {item ? (
              <img src={item.url} alt={"Pratinjau " + item.file.name} />
            ) : (
              <label className="drop-zone">
                <ImagePlus size={42} />
                <h2>Pilih foto ceritamu</h2>
                <p>JPG, PNG, WebP · hingga {maxItems} foto</p>
                <span className="primary">Pilih dari perangkat</span>
                <input
                  aria-label="Pilih foto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => void add(e.target.files)}
                />
              </label>
            )}
          </div>
          {items.length > 0 && (
            <div className="thumbs">
              {items.map((i, n) => (
                <button
                  disabled={busy}
                  className={n === selected ? "selected" : ""}
                  key={i.id}
                  onClick={() => setSelected(n)}
                >
                  <img src={i.url} alt={"Foto " + (n + 1)} />
                  {i.progress === 100 && <Check size={15} />}
                  {items.length > 1 && (
                    <span
                      className={"thumb-cover" + (n === thumbnail ? " active" : "")}
                      title="Jadikan sampul"
                      onClick={(e) => {
                        e.stopPropagation();
                        setThumbnail(n);
                      }}
                    >
                      {n === thumbnail ? "Sampul" : "Jadikan sampul"}
                    </span>
                  )}
                </button>
              ))}
              {items.length < maxItems && (
                <label className="add-thumb">
                  <ImagePlus />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy}
                    onChange={(e) => void add(e.target.files)}
                  />
                </label>
              )}
            </div>
          )}
        </section>
        <section className="panel compose-controls">
          <h2>Detail foto</h2>
          {item && (
            <>
              <div className="row between">
                <small className="filename">{item.file.name}</small>
                <button
                  disabled={busy}
                  title="Hapus foto"
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    if (item.publicId) void api.deleteUpload(item.publicId).catch(() => {});
                    setItems((old) => old.filter((i) => i.id !== item.id));
                    setThumbnail(0);
                    setSelected(0);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <fieldset disabled={busy || item.progress > 0}>
                <label>
                  Potongan tengah
                  <select
                    value={item.options.crop}
                    onChange={(e) =>
                      patch(item.id, {
                        blob: undefined,
                        options: { ...item.options, crop: e.target.value },
                      })
                    }
                  >
                    <option value="original">Proporsi asli</option>
                    <option value="square">Persegi 1:1</option>
                    <option value="portrait">Potret 4:5</option>
                    <option value="landscape">Lanskap 1.91:1</option>
                  </select>
                </label>
                <button
                  className="wide"
                  onClick={() =>
                    patch(item.id, {
                      blob: undefined,
                      options: {
                        ...item.options,
                        rotation: (item.options.rotation + 90) % 360,
                      },
                    })
                  }
                >
                  <RotateCw size={16} />
                  Putar · {item.options.rotation}°
                </button>
                <button className="wide" onClick={() => void preview()}>
                  Terapkan & lihat hasil
                </button>
              </fieldset>
              <div className="size-report">
                <span>
                  Sumber <b>{formatBytes(item.file.size)}</b>
                </span>
                <span>
                  WebP{" "}
                  <b>
                    {item.blob ? formatBytes(item.blob.size) : "Otomatis dipadatkan saat diunggah"}
                  </b>
                </span>
                <small>Dipadatkan otomatis, maksimal 1 MB per foto.</small>
              </div>
            </>
          )}
          <label>
            Caption
            <textarea
              maxLength={2200}
              rows={4}
              placeholder="Ceritakan momen ini… Sebut teman dengan @username"
              value={caption}
              disabled={busy}
              onChange={(e) => setCaption(e.target.value)}
            />
            <small>{caption.length}/2200</small>
          </label>
          {error && <ErrorBox message={error} />}
          {busy && (
            <div role="status">
              <p>{stage}</p>
              <progress
                max={100}
                value={
                  items.reduce((s, i) => s + i.progress, 0) /
                  Math.max(1, items.length)
                }
              />
            </div>
          )}
          <button
            className="primary wide"
            disabled={busy || !items.length}
            onClick={() => void publish()}
          >
            <UploadCloud size={18} />
            {busy
              ? "Mohon tunggu…"
              : error
                ? "Coba terbitkan lagi"
                : "Terbitkan foto"}
          </button>
          <p className="hint">Foto yang dipublikasikan bersifat publik.</p>
        </section>
      </div>
    </div>
  );
}
