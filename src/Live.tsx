import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Send, Users, X, Video, VideoOff, Mic, MicOff, Maximize2 } from "lucide-react";
import AgoraRTC from "agora-rtc-sdk-ng";
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { Room, RoomEvent, createLocalTracks } from "livekit-client";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, Loading, ErrorBox } from "./ui";
import { db, errorText, go, type Profile } from "./lib";
import { livekitUrl, agoraAppId } from "./config";
import type { ChatEvent, LiveJoin, LiveStream } from "./domain/types";

const FOLLOWER_MIN = 100;

export default function LivePage({ id, me, canStartLive = false }: { id?: number; me: Profile & { follower_count: number }; canStartLive?: boolean }) {
  if (id) return <LiveRoom id={id} me={me} />;
  return <LiveLobby me={me} canStartLive={canStartLive} />;
}

function LiveLobby({ me, canStartLive }: { me: Profile & { follower_count: number }; canStartLive: boolean }) {
  const feed = useLoad(() => api.liveFeed(), []);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = canStartLive || me.follower_count >= FOLLOWER_MIN;
  async function start() {
    setBusy(true);
    setError("");
    try {
      const stream = await api.goLive(title);
      sessionStorage.setItem(`octgram-live:${stream.id}`, JSON.stringify(stream));
      go(`/live/${stream.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="live-lobby">
      <header className="live-lobby-head">
        <h1>
          <Radio size={26} /> Live
        </h1>
        <p>Siaran video langsung ke pengikutmu, lengkap dengan obrolan real-time.</p>
      </header>
      <section className="panel live-start">
        {eligible ? (
          <>
            <label>
              Judul siaran
              <input value={title} maxLength={100} placeholder="Sedang apa nih?" onChange={(e) => setTitle(e.target.value)} />
            </label>
            {error && <ErrorBox message={error} />}
            <button className="primary" disabled={busy} onClick={start}>
              {busy ? "Memulai…" : "Mulai Live"}
            </button>
            {canStartLive && me.follower_count < FOLLOWER_MIN && (
              <p className="admin-live-note">Akun administrator dapat memulai live tanpa batas minimum pengikut.</p>
            )}
          </>
        ) : (
          <div className="live-locked">
            <Radio size={32} />
            <h2>Live terkunci</h2>
            <p>
              Kamu butuh minimal <b>{FOLLOWER_MIN} pengikut</b> untuk memulai siaran langsung. Saat ini kamu punya{" "}
              <b>{me.follower_count}</b> pengikut.
            </p>
            <button onClick={() => go("/explore")}>Cari lebih banyak teman</button>
          </div>
        )}
      </section>
      <h2 className="live-section-title">Sedang live</h2>
      {feed.busy && <Loading />}
      {feed.error && <ErrorBox message={feed.error} retry={feed.reload} />}
      {feed.value && !feed.value.length && <p className="empty-line">Belum ada yang live sekarang.</p>}
      <div className="live-grid">
        {feed.value?.map((s: LiveStream) => (
          <button key={s.id} className="live-card" onClick={() => go(`/live/${s.id}`)}>
            <Avatar p={s.host as Profile} size={44} />
            <div>
              <b>{s.title}</b>
              <small>@{s.host.username}</small>
            </div>
            <span className="live-badge">
              <Radio size={12} /> LIVE
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LiveRoom({ id, me }: { id: number; me: Profile }) {
  const [join, setJoin] = useState<LiveJoin | null>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(`octgram-live:${id}`) || "null") as LiveJoin | null;
      return cached?.id === id && cached.token ? cached : null;
    } catch { return null; }
  });
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [connected, setConnected] = useState(false);
  const [ending, setEnding] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState("");
  const videoRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<() => void>(() => {});
  const chatChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const localTracks = useRef<[IMicrophoneAudioTrack, ICameraVideoTrack] | null>(null);

  useEffect(() => {
    if (join?.id === id && join.token) return;
    let cancelled = false;
    api
      .joinLive(id)
      .then((data) => {
        if (!cancelled) {
          sessionStorage.setItem(`octgram-live:${id}`, JSON.stringify(data));
          setJoin(data);
        }
      })
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [id, join?.id, join?.token]);

  const stopLive = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setActionError("");
    try {
      await api.endLive(id);
      await chatChannelRef.current?.send({ type: "broadcast", event: "ended", payload: { id } });
      stopRef.current();
      sessionStorage.removeItem(`octgram-live:${id}`);
      go("/live");
    } catch (e) {
      setActionError(errorText(e));
      setEnding(false);
    }
  }, [ending, id]);

  // Auto-cutoff: the server hands us a session budget (session_minutes) that
  // already accounts for the remaining safe quota. We enforce it client-side
  // so a broadcast can never silently run past what's actually left.
  useEffect(() => {
    if (!join?.session_minutes || !join.is_host) return;
    const elapsed = Math.max(0, Date.now() - new Date(join.started_at).getTime());
    const remaining = Math.max(0, join.session_minutes * 60 * 1000 - elapsed);
    if (!remaining) { void stopLive(); return; }
    const t = setTimeout(() => void stopLive(), remaining);
    return () => clearTimeout(t);
  }, [join?.session_minutes, join?.is_host, stopLive]);

  useEffect(() => {
    if (!join || join.status === "ended") return;
    const channel = db.channel(`live-chat:${id}`, {
      config: { broadcast: { self: false }, presence: { key: `${me.id}:${crypto.randomUUID()}` } },
    });
    chatChannelRef.current = channel;
    const refreshPresence = () => {
      const state = channel.presenceState() as Record<string, Array<{ role?: string }>>;
      const audience = Object.values(state).flat().filter((entry) => entry.role !== "host").length;
      setViewers(audience);
    };
    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const event = payload as ChatEvent;
        if (event?.kind === "chat") setMessages((current) => [...current.slice(-100), event]);
      })
      .on("broadcast", { event: "ended" }, () => setJoin((current) => current ? { ...current, status: "ended" } : current))
      .on("presence", { event: "sync" }, refreshPresence)
      .on("presence", { event: "join" }, refreshPresence)
      .on("presence", { event: "leave" }, refreshPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: me.id, role: join.is_host ? "host" : "viewer", onlineAt: new Date().toISOString() });
          setChatReady(true);
          setChatError("");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChatReady(false);
          setChatError("Chat sedang menyambung ulang.");
        }
      });
    return () => {
      chatChannelRef.current = null;
      setChatReady(false);
      void db.removeChannel(channel);
    };
  }, [id, join?.status, join?.is_host, me.id]);

  useEffect(() => {
    if (!join || join.status === "ended") return;
    const check = async () => {
      try {
        const status = await api.liveStatus(id);
        if (!status || status.status === "ended") setJoin((current) => current ? { ...current, status: "ended" } : current);
      } catch { /* koneksi singkat tidak boleh memutus video */ }
    };
    const timer = window.setInterval(() => void check(), 5000);
    return () => window.clearInterval(timer);
  }, [id, join?.status]);

  useEffect(() => {
    if (!join?.token || join.status === "ended") return;
    let disposed = false;
    const cleanupFns: Array<() => void> = [];

    (async () => {
      if (join.provider === "agora" && agoraAppId) {
        const client: IAgoraRTCClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        await client.setClientRole(join.is_host ? "host" : "audience");
        await client.join(agoraAppId, join.room_name, join.token, me.id);
        if (disposed) return;
        setConnected(true);
        if (join.is_host) {
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          localTracks.current = [audioTrack, videoTrack];
          if (videoRef.current) videoTrack.play(videoRef.current);
          await client.publish([audioTrack, videoTrack]);
        }
        client.on("user-published", async (remote, mediaType) => {
          await client.subscribe(remote, mediaType);
          if (mediaType === "video" && videoRef.current) remote.videoTrack?.play(videoRef.current);
          if (mediaType === "audio") remote.audioTrack?.play();
        });
        stopRef.current = () => {
          localTracks.current?.forEach((t) => t.close());
          void client.leave();
        };
        cleanupFns.push(() => { localTracks.current?.forEach((t) => t.close()); void client.leave(); });

      } else if (join.provider === "livekit" && livekitUrl) {
        const token = join.token;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        await room.connect(livekitUrl, token as string);
        if (disposed) return;
        setConnected(true);
        if (join.is_host) {
          const tracks = await createLocalTracks({ audio: true, video: { resolution: { width: 720, height: 1280 } } });
          for (const t of tracks) {
            await room.localParticipant.publishTrack(t);
            if (t.kind === "video" && videoRef.current) videoRef.current.appendChild(t.attach());
          }
        }
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!join.is_host && videoRef.current) videoRef.current.appendChild(track.attach());
        });
        room.on(RoomEvent.Disconnected, () => setConnected(false));
        stopRef.current = () => room.disconnect();
        cleanupFns.push(() => room.disconnect());
        (window as unknown as { __octgramRoom?: Room }).__octgramRoom = room;
      }
    })().catch(async (e) => {
      if (disposed) return;
      cleanupFns.forEach((fn) => fn());
      if (join.is_host) await api.endLive(id).catch(() => {});
      setError(errorText(e));
    });

    return () => {
      disposed = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, [join, me.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const body = chatInput.trim();
    if (!body || !join || !chatReady || !chatChannelRef.current) return;
    const event: ChatEvent = { kind: "chat", body: body.slice(0, 240), from: me.id, name: me.display_name };
    try {
      await chatChannelRef.current.send({ type: "broadcast", event: "message", payload: event });
      setMessages((m) => [...m.slice(-100), event]);
      setChatInput("");
      setChatError("");
    } catch { setChatError("Komentar gagal dikirim. Coba kembali."); }
  }

  if (error) return <ErrorBox message={error} retry={() => go("/live")} />;
  if (!join) return <Loading />;
  if (join.status === "ended")
    return (
      <div className="empty">
        <h1>Live sudah berakhir</h1>
        <button onClick={() => go("/live")}>Kembali</button>
      </div>
    );

  return (
    <div className="live-room">
      <div className="live-stage">
        <div className="live-stage-head">
          <div className="live-stage-host">
            <Avatar p={join.host as Profile} size={36} />
            <div>
              <b>{join.host.display_name}</b>
              <small>{join.title}</small>
            </div>
          </div>
          <span className="live-badge live-badge-on-stage">
            <Radio size={12} /> LIVE
          </span>
          <span className="live-viewers">
            <Users size={15} /> {viewers}
          </span>
          <button className="bare live-close" onClick={() => join.is_host ? void stopLive() : go("/live")}>
            <X size={20} />
          </button>
          <button className="bare live-fullscreen" aria-label="Layar penuh" onClick={() => void document.querySelector(".live-room")?.requestFullscreen?.()}>
            <Maximize2 size={18} />
          </button>
        </div>
        <div ref={videoRef} className="live-video-frame">
          {!connected && <Loading />}
        </div>
        {join.is_host && (
          <div className="live-controls">
            <button
              onClick={() => {
                if (localTracks.current) void localTracks.current[1].setEnabled(!camOn);
                else void (window as unknown as { __octgramRoom?: Room }).__octgramRoom?.localParticipant.setCameraEnabled(!camOn);
                setCamOn(!camOn);
              }}
            >
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              onClick={() => {
                if (localTracks.current) void localTracks.current[0].setEnabled(!micOn);
                else void (window as unknown as { __octgramRoom?: Room }).__octgramRoom?.localParticipant.setMicrophoneEnabled(!micOn);
                setMicOn(!micOn);
              }}
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button className="danger" disabled={ending} onClick={stopLive}>
              {ending ? "Mengakhiri…" : "Akhiri Live"}
            </button>
          </div>
        )}
        {actionError && <div className="live-action-error">{actionError}</div>}
      </div>
      <aside className="live-chat">
        <div className="live-chat-log">
          {messages.map((m, i) => (
            <p key={i}>
              <b>{m.name}</b> {m.body}
            </p>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form className="live-chat-input" onSubmit={sendChat}>
          <input value={chatInput} maxLength={240} placeholder={chatReady ? "Kirim komentar…" : "Menyambungkan chat…"} disabled={!chatReady} onChange={(e) => setChatInput(e.target.value)} />
          <button type="submit" aria-label="Kirim" disabled={!chatReady || !chatInput.trim()}>
            <Send size={17} />
          </button>
        </form>
        {chatError && <small className="live-chat-error">{chatError}</small>}
      </aside>
    </div>
  );
}
