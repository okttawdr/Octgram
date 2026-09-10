import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, RefreshCw, Search, Phone } from "lucide-react";
import { db, go, date, errorText, type Profile } from "./lib";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, Loading, ErrorBox, Empty } from "./ui";
type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
  a: Profile;
  b: Profile;
};
type Message = {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  client_id: string;
};
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
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    if (request.current?.body !== body)
      request.current = { id: crypto.randomUUID(), body };
    try {
      const row = await api.sendMessage(conversation.id, body, request.current!.id) as Message;
      if (live.current) {
        merge([row]);
        setBody("");
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
        {messages.map((m) => (
          <div
            className={"message " + (m.sender_id === uid ? "mine" : "")}
            key={m.id}
          >
            <p>{m.body}</p>
            <small>{date(m.created_at)}</small>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <ErrorBox message={error} />}
      <form className="chat-form" onSubmit={send}>
        <input
          aria-label="Pesan"
          placeholder="Tulis pesan…"
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          disabled={busy}
        />
        <button
          className="primary"
          aria-label="Kirim pesan"
          disabled={busy || !body.trim()}
        >
          <Send size={19} />
        </button>
      </form>
    </>
  );
}
