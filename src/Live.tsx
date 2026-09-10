import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Send, Users, X, Video, VideoOff, Mic, MicOff } from "lucide-react";
import AgoraRTC from "agora-rtc-sdk-ng";
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import AgoraRTM from "agora-rtm-sdk";
import { Room, RoomEvent, createLocalTracks } from "livekit-client";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, Loading, ErrorBox } from "./ui";
import { errorText, go, type Profile } from "./lib";
import { livekitUrl, agoraAppId } from "./config";
import type { ChatEvent, LiveJoin, LiveStream } from "./domain/types";

const FOLLOWER_MIN = 100;

export default function LivePage({ id, me }: { id?: number; me: Profile & { follower_count: number } }) {
  if (id) return <LiveRoom id={id} me={me} />;
  return <LiveLobby me={me} />;
}

function LiveLobby({ me }: { me: Profile & { follower_count: number } }) {
  const feed = useLoad(() => api.liveFeed(), []);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = me.follower_count >= FOLLOWER_MIN;
  async function start() {
    setBusy(true);
    setError("");
    try {
      const stream = await api.goLive(title);
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
  const [join, setJoin] = useState<LiveJoin | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [chatInput, setChatInput] = useState("");
  const videoRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<() => void>(() => {});
  const localTracks = useRef<[IMicrophoneAudioTrack, ICameraVideoTrack] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .joinLive(id)
      .then((data) => !cancelled && setJoin(data))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const stopLive = useCallback(async () => {
    stopRef.current();
    await api.endLive(id).catch(() => {});
    go("/live");
  }, [id]);

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

        // Chat + viewer presence over Agora RTM. Best-effort: a chat/presence
        // hiccup should never take down the video itself.
        if (join.chat_token) {
          try {
            const rtm = new AgoraRTM.RTM(agoraAppId, me.id);
            await rtm.login({ token: join.chat_token });
            await rtm.subscribe(join.room_name, { withMessage: true, withPresence: true });
            rtm.addEventListener("message", (evt) => {
              if (evt.channelName !== join.room_name || typeof evt.message !== "string") return;
              try {
                const parsed = JSON.parse(evt.message) as ChatEvent;
                if (parsed.kind === "chat") setMessages((m) => [...m.slice(-100), parsed]);
              } catch { /* ignore malformed chat payloads */ }
            });
            const refreshPresence = () =>
              rtm.presence
                .getOnlineUsers(join.room_name, "MESSAGE")
                .then((r) => setViewers(Math.max(0, (r.totalOccupancy || 1) - 1)))
                .catch(() => {});
            refreshPresence();
            const presenceTimer = setInterval(refreshPresence, 10000);
            cleanupFns.push(() => { clearInterval(presenceTimer); void rtm.logout(); });
            (window as unknown as { __octgramRtm?: unknown }).__octgramRtm = rtm;
          } catch { /* chat is optional; video keeps working without it */ }
        }
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
        const refreshCount = () => setViewers(Math.max(0, room.numParticipants - 1));
        refreshCount();
        room.on(RoomEvent.ParticipantConnected, refreshCount);
        room.on(RoomEvent.ParticipantDisconnected, refreshCount);
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!join.is_host && videoRef.current) videoRef.current.appendChild(track.attach());
        });
        room.on(RoomEvent.DataReceived, (payload) => {
          try {
            const evt = JSON.parse(new TextDecoder().decode(payload)) as ChatEvent;
            if (evt.kind === "chat") setMessages((m) => [...m.slice(-100), evt]);
          } catch { /* ignore malformed payloads */ }
        });
        stopRef.current = () => room.disconnect();
        cleanupFns.push(() => room.disconnect());
        (window as unknown as { __octgramRoom?: Room }).__octgramRoom = room;
      }
    })().catch((e) => !disposed && setError(errorText(e)));

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
    if (!body || !join) return;
    const event: ChatEvent = { kind: "chat", body: body.slice(0, 240), from: me.id, name: me.display_name };
    try {
      if (join.provider === "agora") {
        const rtm = (window as unknown as { __octgramRtm?: { publish: (c: string, m: string) => Promise<void> } }).__octgramRtm;
        await rtm?.publish(join.room_name, JSON.stringify(event));
      } else {
        const room = (window as unknown as { __octgramRoom?: Room }).__octgramRoom;
        await room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), { reliable: true });
      }
      setMessages((m) => [...m.slice(-100), event]);
      setChatInput("");
    } catch { /* best-effort: dropped chat message is not fatal */ }
  }

  if (error) return <ErrorBox message={error} retry={() => go("/live")} />;
  if (!join) return <Loading />;
  if (join.status === "ended" && !join.is_host)
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
            <button className="danger" onClick={stopLive}>
              Akhiri Live
            </button>
          </div>
        )}
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
          <input value={chatInput} maxLength={240} placeholder="Kirim komentar…" onChange={(e) => setChatInput(e.target.value)} />
          <button type="submit" aria-label="Kirim">
            <Send size={17} />
          </button>
        </form>
      </aside>
    </div>
  );
}
