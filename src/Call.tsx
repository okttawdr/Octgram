import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Signal, RotateCcw } from "lucide-react";
import { db, type Profile } from "./lib";
import { api } from "./services/api";
import { Avatar } from "./ui";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from: string }
  | { type: "accept"; from: string }
  | { type: "hangup"; from: string }
  | { type: "decline"; from: string }
  | { type: "cancel"; from: string };

type Invite = { callId: string; from: string; fromProfile: Profile };

// Global, app-wide: mounted once in the Shell so an incoming call can be
// answered no matter which page the person is currently on.
export function useIncomingCalls(uid: string) {
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    const channel = db.channel(`call-inbox:${uid}`);
    channel
      .on("broadcast", { event: "invite" }, ({ payload }) => setInvite(payload as Invite))
      .on("broadcast", { event: "cancel-invite" }, ({ payload }) => {
        const data = payload as { callId: string };
        setInvite((cur) => (cur && cur.callId === data.callId ? null : cur));
      })
      .subscribe();
    return () => void db.removeChannel(channel);
  }, [uid]);
  return [invite, setInvite] as const;
}

export function callInvite(peerId: string, from: string, fromProfile: Profile, callId: string) {
  const channel = db.channel(`call-inbox:${peerId}`);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void channel.send({ type: "broadcast", event: "invite", payload: { callId, from, fromProfile } });
      setTimeout(() => void db.removeChannel(channel), 1500);
    }
  });
}

export function cancelInvite(peerId: string, callId: string) {
  const channel = db.channel(`call-inbox:${peerId}`);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void channel.send({ type: "broadcast", event: "cancel-invite", payload: { callId } });
      setTimeout(() => void db.removeChannel(channel), 1500);
    }
  });
}

const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

async function getCallMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser tidak mendukung panggilan video.");
  const ladder: MediaStreamConstraints[] = [
    { audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } },
    { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: true, video: true },
    { audio: true, video: false },
  ];
  let lastError: unknown = null;
  for (const constraints of ladder) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Tidak bisa mengakses kamera/mikrofon.");
}

function attachVideo(el: HTMLVideoElement | null, stream: MediaStream | null, unmuteAfterPlay?: boolean) {
  if (!el) return;
  el.srcObject = stream;
  if (stream) {
    // Autoplay of unmuted media is blocked by browsers without a fresh user
    // gesture — which we don't reliably have once ICE finishes negotiating
    // asynchronously. Start muted (always allowed), then unmute right after
    // playback actually starts so the remote video never gets stuck black.
    if (unmuteAfterPlay) el.muted = true;
    const play = () => {
      el.play()
        .then(() => {
          if (unmuteAfterPlay) el.muted = false;
        })
        .catch(() => {
          /* still blocked — leave muted so at least the picture shows */
        });
    };
    if (el.readyState >= 1) play();
    else el.onloadedmetadata = play;
  }
}
export function CallRoom({
  uid,
  me,
  peer,
  callId,
  isCaller,
  onClose,
}: {
  uid: string;
  me: Profile;
  peer: Profile;
  callId: string;
  isCaller: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(isCaller ? "Menghubungi…" : "Menyambungkan…");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteOn, setRemoteOn] = useState(false);
  const [netState, setNetState] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const chan = useRef<RealtimeChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const closed = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    let disposed = false;
    let acceptTimer: ReturnType<typeof setInterval> | null = null;
    let offerDone = false;
    const setSafe = (s: string) => {
      if (!disposed) setStatus(s);
    };
    const ensureRemote = () => {
      if (!remoteStream.current) remoteStream.current = new MediaStream();
      return remoteStream.current;
    };
    const flushIce = async (conn: RTCPeerConnection) => {
      if (!conn.remoteDescription) return;
      const queued = pendingIce.current.splice(0);
      for (const c of queued) {
        try {
          await conn.addIceCandidate(c);
        } catch {
          /* kandidat basi — aman diabaikan */
        }
      }
    };
    const refreshRemote = () => {
      const rs = remoteStream.current;
      if (!rs || rs.getTracks().length === 0) return;
      attachVideo(remoteVideo.current, rs, true);
      if (!disposed) {
        setRemoteOn(rs.getVideoTracks().some((v) => v.enabled && v.readyState === "live" && !v.muted) || rs.getAudioTracks().length > 0);
        if (statusRef.current !== "Tersambung") setStatus("Tersambung");
      }
    };
    (async () => {
      let iceServers: RTCIceServer[] = STUN as RTCIceServer[];
      try {
        const turn = await api.turnCredentials();
        if (turn?.iceServers?.length) iceServers = [...STUN, ...turn.iceServers] as RTCIceServer[];
      } catch {
        /* tetap jalan dengan STUN publik */
      }
      if (disposed) return;
      const conn = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
      pc.current = conn;
      if (!disposed) setNetState(conn.connectionState);
      let media: MediaStream;
      try {
        media = await getCallMedia();
      } catch {
        if (!disposed) {
          setErrMsg("Tidak bisa mengakses kamera/mikrofon. Izinkan akses lalu coba lagi.");
          setStatus("Gagal memulai panggilan");
        }
        return;
      }
      if (disposed) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (media.getVideoTracks().length === 0 && !disposed) setCamOn(false);
      attachVideo(localVideo.current, media);
      requestAnimationFrame(() => {
        if (!disposed) {
          attachVideo(localVideo.current, stream.current);
          if (remoteStream.current?.getTracks().length) attachVideo(remoteVideo.current, remoteStream.current, true);
        }
      });
      media.getTracks().forEach((t) => conn.addTrack(t, media));
      const send = (signal: Signal) => {
        void chan.current?.send({ type: "broadcast", event: "signal", payload: signal }).catch(() => null);
      };
      conn.ontrack = (e) => {
        const rs = ensureRemote();
        e.streams[0]?.getTracks().forEach((t) => {
          if (!rs.getTrackById(t.id)) rs.addTrack(t);
        });
        const tr = e.track;
        if (tr && !rs.getTrackById(tr.id)) {
          try {
            rs.addTrack(tr);
          } catch { /* abaikan */ }
        }
        tr.onmute = () => refreshRemote();
        tr.onunmute = () => refreshRemote();
        refreshRemote();
      };
      conn.onconnectionstatechange = () => {
        if (disposed) return;
        setNetState(conn.connectionState);
        if (conn.connectionState === "connected") {
          setSafe("Tersambung");
          refreshRemote();
        } else if (conn.connectionState === "connecting") {
          if (statusRef.current === "Tersambung") setSafe("Menghubungkan ulang…");
        } else if (conn.connectionState === "failed") {
          setSafe("Koneksi terputus. Mencoba menyambung ulang…");
          try {
            conn.restartIce?.();
          } catch { /* abaikan */ }
          if (isCaller && offerDone) {
            void conn.createOffer({ iceRestart: true }).then(async (offer) => {
              await conn.setLocalDescription(offer).catch(() => null);
              send({ type: "offer", sdp: offer, from: uid });
            }).catch(() => null);
          }
        } else if (conn.connectionState === "disconnected") {
          if (statusRef.current === "Tersambung") setSafe("Sinyal lemah…");
        }
      };

      conn.oniceconnectionstatechange = () => {
        if (disposed) return;
        if (conn.iceConnectionState === "failed") {
          setSafe("Jaringan sulit ditembus. Mencoba lewat relay…");
          try {
            conn.restartIce?.();
          } catch { /* abaikan */ }
        }
      };
      const channel = db.channel(`call:${callId}`);
      chan.current = channel;
      const handleSignal = async (signal: Signal) => {
        if (signal.from === uid || disposed) return;
        try {
          if (signal.type === "accept" && isCaller) {
            if (offerDone && conn.signalingState === "stable") return;
            offerDone = true;
            const offer = await conn.createOffer();
            await conn.setLocalDescription(offer);
            send({ type: "offer", sdp: offer, from: uid });
          } else if (signal.type === "offer" && !isCaller) {
            if (conn.signalingState === "stable" || conn.signalingState === "have-remote-offer") {
              await conn.setRemoteDescription(signal.sdp).catch(() => null);
              await flushIce(conn).catch(() => null);
              const answer = await conn.createAnswer();
              await conn.setLocalDescription(answer);
              send({ type: "answer", sdp: answer, from: uid });
              await flushIce(conn).catch(() => null);
            }
          } else if (signal.type === "answer" && isCaller) {
            if (conn.signalingState === "have-local-offer") {
              await conn.setRemoteDescription(signal.sdp);
              await flushIce(conn).catch(() => null);
            }
          } else if (signal.type === "ice") {
            if (conn.remoteDescription) {
              try {
                await conn.addIceCandidate(signal.candidate);
              } catch { /* abaikan kandidat basi */ }
            } else {
              pendingIce.current.push(signal.candidate);
              if (pendingIce.current.length > 100) pendingIce.current.shift();
            }
          } else if (signal.type === "hangup" || signal.type === "decline" || signal.type === "cancel") {
            if (signal.type === "decline") setSafe("Panggilan ditolak.");
            if (signal.type === "cancel") setSafe("Panggilan dibatalkan.");
            const delay = signal.type === "hangup" ? 0 : 900;
            setTimeout(() => {
              if (!closed.current) {
                closed.current = true;
                onClose();
              }
            }, delay);
          }
        } catch {
          /* satu sinyal rusak tidak boleh mematikan panggilan */
        }
      };
      channel.on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as Signal));
      conn.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON(), from: uid });
      };
      channel.subscribe((subStatus) => {
        if (disposed) return;
        if (subStatus === "SUBSCRIBED" && !isCaller) {
          send({ type: "accept", from: uid });
          let n = 0;
          acceptTimer = setInterval(() => {
            n += 1;
            if (n > 5 || offerDone || disposed || conn.remoteDescription) {
              if (acceptTimer) clearInterval(acceptTimer);
              return;
            }
            send({ type: "accept", from: uid });
          }, 1500);
        }
      });
    })().catch(() => {
      if (!disposed) {
        setErrMsg("Gagal memulai panggilan. Periksa izin kamera/mikrofon dan koneksi.");
        setStatus("Gagal memulai panggilan");
      }
    });

    return () => {
      disposed = true;
      if (acceptTimer) clearInterval(acceptTimer);
      stream.current?.getTracks().forEach((t) => t.stop());
      remoteStream.current?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
      if (chan.current) {
        void db.removeChannel(chan.current);
      }
    };
  }, [callId, isCaller, uid, onClose]);

  function hangUp() {
    if (!closed.current) {
      closed.current = true;
      void chan.current?.send({ type: "broadcast", event: "signal", payload: { type: isCaller ? "cancel" : "hangup", from: uid } as Signal }).catch(() => null);
      if (isCaller) cancelInvite(peer.id, callId);
    }
    onClose();
  }

  function retryHandshake() {
    const conn = pc.current;
    if (!conn) return;
    setStatus(isCaller ? "Menghubungi ulang…" : "Menyambungkan ulang…");
    pendingIce.current = [];
    try {
      conn.restartIce?.();
    } catch { /* abaikan */ }
    if (isCaller) {
      void conn.createOffer({ iceRestart: true }).then(async (offer) => {
        await conn.setLocalDescription(offer).catch(() => null);
        void chan.current?.send({ type: "broadcast", event: "signal", payload: { type: "offer", sdp: offer, from: uid } as Signal }).catch(() => null);
      }).catch(() => setStatus("Gagal menyambung ulang. Coba tutup lalu telepon lagi."));
    } else {
      void chan.current?.send({ type: "broadcast", event: "signal", payload: { type: "accept", from: uid } as Signal }).catch(() => null);
    }
  }

  const showWaiting = status !== "Tersambung";
  const netLabel = netState === "connected" ? "Jaringan bagus" : netState === "connecting" ? "Menghubungkan…" : netState === "failed" || netState === "disconnected" ? "Jaringan bermasalah" : "";
  const showRetry = status.includes("terputus") || status.includes("relay") || status.includes("Gagal") || status.includes("lemah") || status.includes("Sinyal");

  return (
    <div className="call-overlay">
      <video ref={remoteVideo} className="call-remote" autoPlay playsInline />
      {!remoteOn && status === "Tersambung" && (
        <div className="call-waiting">
          <Avatar p={peer} size={88} />
          <h2>{peer.display_name || peer.username}</h2>
          <p>Video lawan belum tampil — menunggu aliran video…</p>
          <button className="call-retry" onClick={retryHandshake}>
            <RotateCcw size={16} /> Coba sambungkan ulang
          </button>
        </div>
      )}
      {showWaiting && (
        <div className="call-waiting">
          <Avatar p={peer} size={88} />
          <h2>{peer.display_name || peer.username}</h2>
          <p>{status}</p>
          {errMsg && <small className="call-net">{errMsg}</small>}
          {netLabel && (
            <small className="call-net">
              <Signal size={13} /> {netLabel}
            </small>
          )}
          {showRetry && (
            <button className="call-retry" onClick={retryHandshake}>
              <RotateCcw size={16} /> Coba sambungkan ulang
            </button>
          )}
        </div>
      )}
      <video ref={localVideo} className="call-local" autoPlay playsInline muted />
      <div className="call-controls">
        <button
          onClick={() => {
            stream.current?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
            setMicOn(!micOn);
          }}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button className="danger" onClick={hangUp}>
          <PhoneOff size={20} />
        </button>
        <button
          onClick={() => {
            stream.current?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
            setCamOn(!camOn);
          }}
        >
          {camOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
      </div>
      <small className="call-hint">{me.display_name}</small>
    </div>
  );
}

export function IncomingCallBanner({
  invite,
  onAccept,
  onDecline,
}: {
  invite: Invite;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="incoming-call">
      <Avatar p={invite.fromProfile} size={40} />
      <div>
        <b>{invite.fromProfile.display_name || invite.fromProfile.username}</b>
        <small>Panggilan video masuk…</small>
      </div>
      <button className="danger" onClick={onDecline} aria-label="Tolak">
        <PhoneOff size={18} />
      </button>
      <button className="primary" onClick={onAccept} aria-label="Terima">
        <Phone size={18} />
      </button>
    </div>
  );
}
