import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { db, type Profile } from "./lib";
import { api } from "./services/api";
import { Avatar } from "./ui";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from: string }
  | { type: "accept"; from: string }
  | { type: "hangup"; from: string };

type Invite = { callId: string; from: string; fromProfile: Profile };

// Global, app-wide: mounted once in the Shell so an incoming call can be
// answered no matter which page the person is currently on.
export function useIncomingCalls(uid: string) {
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    const channel = db.channel(`call-inbox:${uid}`);
    channel
      .on("broadcast", { event: "invite" }, ({ payload }) => setInvite(payload as Invite))
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
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const chan = useRef<RealtimeChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { iceServers } = await api.turnCredentials().catch(() => ({ iceServers: [] }));
      const conn = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...(iceServers || [])] });
      pc.current = conn;
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (disposed) return;
      stream.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      media.getTracks().forEach((t) => conn.addTrack(t, media));
      conn.ontrack = (e) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
        setStatus("Tersambung");
      };

      const channel = db.channel(`call:${callId}`);
      chan.current = channel;
      channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const signal = payload as Signal;
        if (signal.from === uid) return;
        if (signal.type === "accept" && isCaller) {
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          send({ type: "offer", sdp: offer, from: uid });
        } else if (signal.type === "offer" && !isCaller) {
          await conn.setRemoteDescription(signal.sdp);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          send({ type: "answer", sdp: answer, from: uid });
        } else if (signal.type === "answer" && isCaller) {
          await conn.setRemoteDescription(signal.sdp);
        } else if (signal.type === "ice") {
          try { await conn.addIceCandidate(signal.candidate); } catch { /* ignore late/duplicate candidates */ }
        } else if (signal.type === "hangup") {
          onClose();
        }
      });
      conn.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON(), from: uid });
      };
      channel.subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED" && !isCaller) send({ type: "accept", from: uid });
      });
      function send(signal: Signal) {
        void channel.send({ type: "broadcast", event: "signal", payload: signal });
      }
    })().catch(() => setStatus("Gagal memulai panggilan"));

    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
      if (chan.current) { void db.removeChannel(chan.current); }
    };
  }, [callId, isCaller, uid, onClose]);

  function hangUp() {
    void chan.current?.send({ type: "broadcast", event: "signal", payload: { type: "hangup", from: uid } as Signal });
    onClose();
  }

  return (
    <div className="call-overlay">
      <video ref={remoteVideo} className="call-remote" autoPlay playsInline />
      {status !== "Tersambung" && (
        <div className="call-waiting">
          <Avatar p={peer} size={88} />
          <h2>{peer.display_name || peer.username}</h2>
          <p>{status}</p>
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
