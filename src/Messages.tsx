import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, RefreshCw, Search, Phone, ImagePlus, Smile, X, Reply, Expand } from "lucide-react";
import { db, go, date, errorText, formatBytes, mediaUrl, type Profile } from "./lib";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, Loading, ErrorBox, Empty, RichText } from "./ui";
import type { Conversation, Message } from "./domain/types";
import { compressChatImage, uploadChatImage } from "./chat-images";
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
  const [imgPreview, setImgPreview] = useState<{ url: string; file: File } | null>(null);
  const [imgProgress, setImgProgress] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
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
  async function pickImage(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    try {
      const packed = await compressChatImage(file);
      if (imgPreview) URL.revokeObjectURL(imgPreview.url);
      // Simpan sebagai File agar mudah diunggah ulang; ukuran sudah dipadatkan berat.
      const compacted = new File([packed.blob], file.name.replace(/\.[a-z]+$/i, "") + ".webp", { type: "image/webp" });
      setImgPreview({ url: URL.createObjectURL(packed.blob), file: compacted });
      setShowEmoji(false);
      inputRef.current?.focus();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text && !imgPreview) return;
    setBusy(true);
    setError("");
    if (request.current?.body !== text)
      request.current = { id: crypto.randomUUID(), body: text || "(gambar)" };
    try {
      let imagePath: string | null = null;
      if (imgPreview) {
        // Kompresi sudah dilakukan saat pilih; unggah ke folder khusus chat.
        const sign = await api.signUpload(crypto.randomUUID().replace(/-/g, "").slice(0, 12), "chat");
        const fullId = `${sign.folder}/${sign.publicId}`;
        setImgProgress(1);
        const done = await uploadChatImage(sign, imgPreview.file, setImgProgress);
        void done;
        imagePath = fullId;
      }
      const row = await api.sendMessage(conversation.id, text, request.current!.id, imagePath ? { imagePath, replyTo: replyTo?.id ?? null } : { replyTo: replyTo?.id ?? null }) as Message;
      if (live.current) {
        merge([row]);
        setBody("");
        setReplyTo(null);
        if (imgPreview) URL.revokeObjectURL(imgPreview.url);
        setImgPreview(null);
        setImgProgress(0);
        setShowEmoji(false);
        request.current = null;
      }
    } catch (e) {
      if (live.current) setError(errorText(e));
    } finally {
      if (live.current) setBusy(false);
    }
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
          const img = m.image_path ? mediaUrl(m.image_path, 800) : null;
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
                      {m.reply.image_path && !m.reply.body ? "📷 Gambar" : (m.reply.body || "📷 Gambar").slice(0, 120)}
                    </span>
                  </span>
                )}
                {img && (
                  <button
                    className="bare msg-image"
                    onClick={() => setLightbox(img)}
                    aria-label="Perbesar gambar"
                  >
                    <img src={img} alt="Lampiran chat" loading="lazy" />
                    <span className="msg-zoom">
                      <Expand size={13} />
                    </span>
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
            <small>{replyTo.image_path && !replyTo.body ? "📷 Gambar" : (replyTo.body || "📷 Gambar").slice(0, 100)}</small>
          </span>
          <button className="bare" aria-label="Batal balas" onClick={() => setReplyTo(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {imgPreview && (
        <div className="img-preview-bar">
          <img src={imgPreview.url} alt="Pratinjau gambar" />
          <span>
            <b>Gambar siap dikirim</b>
            <small>
              {formatBytes(imgPreview.file.size)} · WebP padat
              {imgProgress > 0 && busy ? ` · ${imgProgress}%` : ""}
            </small>
            {busy && imgProgress > 0 && <progress value={imgProgress} max={100} />}
          </span>
          <button className="bare" aria-label="Hapus gambar" disabled={busy} onClick={() => { URL.revokeObjectURL(imgPreview.url); setImgPreview(null); setImgProgress(0); }}>
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
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pickImage(e.target.files); e.target.value = ""; }} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Kirim gambar"
          title="Kirim gambar"
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
          disabled={busy || (!body.trim() && !imgPreview)}
        >
          <Send size={19} />
        </button>
      </form>
      {lightbox && (
        <div className="lightbox" role="dialog" aria-label="Pratinjau gambar" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Gambar chat diperbesar" onClick={(e) => e.stopPropagation()} />
          <button className="bare lightbox-close" aria-label="Tutup" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <a className="lightbox-open" href={lightbox} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            Buka penuh
          </a>
        </div>
      )}
    </>
  );
}
