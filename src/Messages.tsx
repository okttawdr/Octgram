import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, RefreshCw, Search, Phone, ImagePlus, Smile, X, Reply, Eye, Play, ShieldCheck } from "lucide-react";
import { db, go, date, errorText, formatBytes, mediaUrl, type Profile } from "./lib";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, Loading, ErrorBox, Empty, RichText } from "./ui";
import type { Conversation, Message } from "./domain/types";
import { prepareOnceMedia, uploadOnceMedia } from "./chat-images";
import { EmojiPicker, QUICK_EMOJIS } from "./emoji";
export default function Messages({
  uid,
  conversationId,
  onStartCall,
}: {
  uid: string;
  conversationId?: string;
  onStartCall?: (peer: Profile) => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [extra, setExtra] = useState<Conversation[]>([]);
  const q = useLoad(
    () => api.conversations() as Promise<Conversation[]>,
    [uid, conversationId],
  );
  const active = useLoad(
    () => !conversationId ? Promise.resolve(null) : api.conversation(conversationId) as Promise<Conversation>,
    [conversationId, uid],
  );
  const [loadError, setLoadError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  useEffect(() => {
    setExtra([]);
    setCursor(null);
    setHasMore(true);
  }, [conversationId]);
  async function more() {
    setLoadingMore(true);
    setLoadError("");
    try {
      const last = extra.at(-1) || q.value?.at(-1);
      if (!last) return;
      const rows = await api.conversations(last.updated_at, last.id) as Conversation[];
      setExtra((old) => [...old, ...rows]);
      setCursor(last.id);
      setHasMore(rows.length === 20);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <div className={"messaging " + (conversationId ? "has-conversation" : "")}>
      <aside className="inbox panel">
        <header className="page-title">
          <h1>Pesan</h1>
          <button
            aria-label="Muat ulang kotak masuk"
            onClick={() => {
              setExtra([]);
              setCursor(null);
              setHasMore(true);
              q.reload();
            }}
          >
            <RefreshCw size={18} />
          </button>
        </header>
        <button className="wide" onClick={() => go("/explore")}>
          <Search size={17} />
          Cari teman untuk berkirim pesan
        </button>
        {q.busy ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox message={q.error} retry={q.reload} />
        ) : !q.value?.length ? (
          <p className="empty-inbox">Percakapanmu akan tampil di sini.</p>
        ) : (
          <>
            {[...(q.value || []), ...extra]
              .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)
              .map((c) => {
                const p = c.user_a === uid ? c.b : c.a;
                return (
                  <button
                    className={
                      "conversation " +
                      (c.id === conversationId ? "active" : "")
                    }
                    key={c.id}
                    onClick={() => go("/messages/" + c.id)}
                  >
                    <Avatar p={p} />
                    <span>
                      <b>{p.display_name || p.username}</b>
                      <small>@{p.username}</small>
                      <small>{date(c.updated_at)}</small>
                    </span>
                  </button>
                );
              })}
            {q.value.length === 20 && hasMore && (
              <button
                className="wide"
                disabled={loadingMore}
                onClick={() => void more()}
              >
                {loadingMore
                  ? "Memuat…"
                  : cursor
                    ? "Muat lagi"
                    : "Percakapan lainnya"}
              </button>
            )}
          </>
        )}
        {loadError && <ErrorBox message={loadError} />}
      </aside>
      <section className="chat panel">
        {!conversationId ? (
          <Empty title="Percakapan dimulai dengan halo">
            <p>Pilih percakapan atau temukan teman lewat pencarian.</p>
          </Empty>
        ) : active.busy ? (
          <Loading />
        ) : active.error ? (
          <ErrorBox message={active.error} retry={active.reload} />
        ) : (
          active.value && (
            <Chat key={conversationId} uid={uid} conversation={active.value} onStartCall={onStartCall} />
          )
        )}
      </section>
    </div>
  );
}
function Chat({
  uid,
  conversation,
  onStartCall,
}: {
  uid: string;
  conversation: Conversation;
  onStartCall?: (peer: Profile) => void;
}) {
  const peer = conversation.user_a === uid ? conversation.b : conversation.a;
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef<{ id: string; body: string } | null>(null);
  const live = useRef(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; blob: Blob; type: "image" | "video"; extension: "webp" | "mp4" | "webm"; name: string } | null>(null);
  const [imgProgress, setImgProgress] = useState(0);
  const [lightbox, setLightbox] = useState<{ id: number; url: string; type: "image" | "video"; ephemeral: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const swipeX = useRef<{ id: number; x: number } | null>(null);
  function merge(rows: Message[]) {
    setMessages((old) =>
      [...new Map([...old, ...rows].map((m) => [m.id, m])).values()].sort(
        (a, b) => a.id - b.id,
      ),
    );
  }
  async function load(before?: number) {
    setLoading(true);
    setError("");
    try {
      const data = await api.messages(conversation.id, before) as Message[];
      if (live.current) {
        merge(data);
        if (before || messages.length === 0) setMore(data.length === 30);
      }
    } catch (e) {
      if (live.current) setError(errorText(e));
    } finally {
      if (live.current) setLoading(false);
    }
  }
  useEffect(() => {
    live.current = true;
    let channel: ReturnType<typeof db.channel> | undefined;
    let epoch = 0;
    async function synchronize(token: number) {
      try {
        const rows = await api.messages(conversation.id) as Message[];
        if (live.current && token === epoch) merge(rows);
      } catch (e) {
        if (live.current) setError(errorText(e));
      }
    }
    function connect() {
      if (document.hidden) return;
      const token = ++epoch;
      channel = db
        .channel("chat:" + conversation.id)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: "conversation_id=eq." + conversation.id,
          },
          (payload) => {
            if (live.current && token === epoch)
              merge([payload.new as Message]);
          },
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: "conversation_id=eq." + conversation.id }, (payload) => {
          const removed = Number((payload.old as { id?: number }).id);
          if (removed) setMessages((old) => old.filter((message) => message.id !== removed));
        })
        .subscribe((status) => {
          if (live.current && token === epoch) {
            setConnected(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") void synchronize(token);
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setError(
                "Koneksi realtime terputus. Muat ulang pesan atau kembali saat jaringan pulih.",
              );
              setLoading(false);
            }
          }
        });
    }
    function disconnect() {
      epoch++;
      if (channel) {
        void db.removeChannel(channel);
        channel = undefined;
      }
      setConnected(false);
    }
    function visibility() {
      if (document.hidden) disconnect();
      else connect();
    }
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live.current = false;
      epoch++;
      document.removeEventListener("visibilitychange", visibility);
      if (channel) void db.removeChannel(channel);
    };
  }, [conversation.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.at(-1)?.id]);
  async function pickMedia(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    try {
      const packed = await prepareOnceMedia(file);
      if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
      setMediaPreview({ ...packed, url: URL.createObjectURL(packed.blob), name: file.name });
      setShowEmoji(false);
      inputRef.current?.focus();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text && !mediaPreview) return;
    setBusy(true);
    setError("");
    if (request.current?.body !== text)
      request.current = { id: crypto.randomUUID(), body: text || "(media sekali lihat)" };
    let uploadedPath: string | null = null;
    try {
      if (mediaPreview) {
        uploadedPath = `${uid}/${conversation.id}/${crypto.randomUUID()}.${mediaPreview.extension}`;
        setImgProgress(15);
        await uploadOnceMedia(uploadedPath, mediaPreview.blob, mediaPreview.type === "image" ? "image/webp" : mediaPreview.blob.type);
        setImgProgress(100);
      }
      const row = await api.sendMessage(conversation.id, text, request.current!.id, uploadedPath ? { mediaPath: uploadedPath, mediaType: mediaPreview!.type, viewOnce: true, replyTo: replyTo?.id ?? null } : { replyTo: replyTo?.id ?? null }) as Message;
      if (live.current) {
        merge([row]);
        setBody("");
        setReplyTo(null);
        if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
        setMediaPreview(null);
        setImgProgress(0);
        setShowEmoji(false);
        request.current = null;
      }
    } catch (e) {
      if (uploadedPath) void db.storage.from("chat-once").remove([uploadedPath]);
      if (live.current) setError(errorText(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function openOnce(message: Message) {
    if (!message.media_path || message.sender_id === uid) return;
    setError("");
    try {
      const media = await api.openOnceMedia(message.id);
      const { data, error } = await db.storage.from("chat-once").createSignedUrl(media.path, 120);
      if (error || !data?.signedUrl) throw error || new Error("Media tidak dapat dibuka.");
      setLightbox({ id: message.id, url: data.signedUrl, type: media.type, ephemeral: true });
    } catch (e) { setError(errorText(e)); }
  }
  async function closeViewer() {
    const current = lightbox;
    setLightbox(null);
    if (!current?.ephemeral) return;
    setMessages((old) => old.filter((message) => message.id !== current.id));
    try { await api.finishOnceMedia(current.id); } catch (e) { setError(errorText(e)); void load(); }
  }
  return (
    <>
      <header className="chat-header">
        <button
          className="mobile-back"
          aria-label="Kembali ke pesan"
          onClick={() => go("/messages")}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          className="bare user"
          onClick={() => go("/profile/" + peer.username)}
        >
          <Avatar p={peer} />
          <span>
            <strong>{peer.display_name || peer.username}</strong>
            <small>
              {connected ? "Percakapan tersambung" : "Menghubungkan…"}
            </small>
          </span>
        </button>
        <button aria-label="Muat ulang pesan" onClick={() => void load()}>
          <RefreshCw size={17} />
        </button>
        {onStartCall && (
          <button aria-label="Panggilan video" onClick={() => onStartCall(peer)}>
            <Phone size={17} />
          </button>
        )}
      </header>
      <div className="chat-scroll">
        {more && messages.length > 0 && (
          <button
            className="older"
            disabled={loading}
            onClick={() => void load(messages[0].id)}
          >
            Pesan sebelumnya
          </button>
        )}
        {loading && <Loading />}
        {!loading && !messages.length && (
          <p className="empty-inbox">
            Ucapkan halo kepada {peer.display_name || peer.username}.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === uid;
          const legacyImg = m.image_path ? mediaUrl(m.image_path, 800) : null;
          return (
            <div
              className={"message-row " + (mine ? "mine" : "theirs")}
              key={m.id}
              onTouchStart={(e) => {
                swipeX.current = { id: m.id, x: e.touches[0].clientX };
              }}
              onTouchEnd={(e) => {
                const start = swipeX.current;
                swipeX.current = null;
                if (!start || start.id !== m.id) return;
                const dx = e.changedTouches[0].clientX - start.x;
                if (dx > 48) {
                  setReplyTo(m);
                  inputRef.current?.focus();
                }
              }}
            >
              <div className={"message " + (mine ? "mine" : "")} id={"msg-" + m.id}>
                <button
                  className="bare msg-reply-btn"
                  aria-label="Balas pesan"
                  title="Balas (atau geser ke kanan)"
                  onClick={() => {
                    setReplyTo(m);
                    inputRef.current?.focus();
                  }}
                >
                  <Reply size={13} />
                </button>
                {m.reply && (
                  <span
                    className="msg-quote"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const el = document.getElementById("msg-" + m.reply!.id);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("msg-highlight");
                        setTimeout(() => el.classList.remove("msg-highlight"), 1200);
                      }
                    }}
                  >
                    <span className="msg-quote-bar" />
                    <span className="msg-quote-text">
                      {(m.reply.image_path || m.reply.media_once) && !m.reply.body ? (m.reply.media_type === "video" ? "▶ Video sekali lihat" : "◉ Foto sekali lihat") : (m.reply.body || "Media").slice(0, 120)}
                    </span>
                  </span>
                )}
                {legacyImg && (
                  <button
                    className="bare msg-image"
                    onClick={() => setLightbox({ id: m.id, url: legacyImg, type: "image", ephemeral: false })}
                    aria-label="Perbesar gambar"
                  >
                    <img src={legacyImg} alt="Lampiran chat lama" loading="lazy" />
                  </button>
                )}
                {m.media_path && m.media_once && (
                  <button className={`bare once-media ${mine ? "sent" : "received"}`} disabled={mine} onClick={() => void openOnce(m)}>
                    <span className="once-media-icon">{m.media_type === "video" ? <Play size={18} fill="currentColor" /> : <Eye size={19} />}</span>
                    <span><strong>{m.media_type === "video" ? "Video sekali lihat" : "Foto sekali lihat"}</strong><small>{mine ? "Terkirim secara privat" : "Ketuk untuk melihat"}</small></span>
                    <ShieldCheck size={15} />
                  </button>
                )}
                {m.body ? (
                  <p>
                    <RichText text={m.body} />
                  </p>
                ) : null}
                <small>{date(m.created_at)}</small>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <ErrorBox message={error} />}
      {replyTo && (
        <div className="reply-bar">
          <span className="reply-bar-icon">
            <Reply size={15} />
          </span>
          <span className="reply-bar-text">
            <b>Membalas {replyTo.sender_id === uid ? "diri sendiri" : peer.display_name || peer.username}</b>
            <small>{(replyTo.image_path || replyTo.media_once) && !replyTo.body ? (replyTo.media_type === "video" ? "Video sekali lihat" : "Foto sekali lihat") : (replyTo.body || "Media").slice(0, 100)}</small>
          </span>
          <button className="bare" aria-label="Batal balas" onClick={() => setReplyTo(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {mediaPreview && (
        <div className="img-preview-bar">
          {mediaPreview.type === "image" ? <img src={mediaPreview.url} alt="Pratinjau foto" /> : <video src={mediaPreview.url} muted playsInline />}
          <span>
            <b>{mediaPreview.type === "image" ? "Foto" : "Video"} sekali lihat</b>
            <small>
              {formatBytes(mediaPreview.blob.size)} · akan hilang setelah dilihat
              {imgProgress > 0 && busy ? ` · ${imgProgress}%` : ""}
            </small>
            {busy && imgProgress > 0 && <progress value={imgProgress} max={100} />}
          </span>
          <button className="bare" aria-label="Hapus media" disabled={busy} onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); setImgProgress(0); }}>
            <X size={16} />
          </button>
        </div>
      )}
      {showEmoji && (
        <EmojiPicker
          onPick={(emoji) => setBody((b) => b + emoji)}
          onClose={() => setShowEmoji(false)}
        />
      )}
      <form className="chat-form chat-form-pro" onSubmit={send}>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden onChange={(e) => { void pickMedia(e.target.files); e.target.value = ""; }} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Kirim media sekali lihat"
          title="Foto atau video sekali lihat"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={19} />
        </button>
        <button
          type="button"
          className={"icon-btn " + (showEmoji ? "active" : "")}
          aria-label="Emoticon"
          title="Emoticon"
          onClick={() => setShowEmoji((s) => !s)}
        >
          <Smile size={19} />
        </button>
        <input
          ref={inputRef}
          aria-label="Pesan"
          placeholder={replyTo ? "Balas pesan…" : "Tulis pesan…"}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
        <button
          className="primary"
          aria-label="Kirim pesan"
          disabled={busy || (!body.trim() && !mediaPreview)}
        >
          <Send size={19} />
        </button>
      </form>
      {lightbox && (
        <div className="lightbox once-viewer" role="dialog" aria-modal aria-label="Media sekali lihat" onClick={() => void closeViewer()}>
          {lightbox.type === "image" ? <img src={lightbox.url} alt="Media sekali lihat" onClick={(e) => e.stopPropagation()} /> : <video src={lightbox.url} controls autoPlay playsInline onEnded={() => void closeViewer()} onClick={(e) => e.stopPropagation()} />}
          {lightbox.ephemeral && <div className="once-viewer-label"><Eye size={16} /> Sekali lihat</div>}
          <button className="bare lightbox-close" aria-label="Selesai melihat" onClick={(e) => { e.stopPropagation(); void closeViewer(); }}>
            <X size={20} />
          </button>
          {lightbox.ephemeral && <p className="once-viewer-help">Ketuk tutup setelah selesai. Media akan dihapus permanen.</p>}
        </div>
      )}
    </>
  );
}
