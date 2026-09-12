import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Home,
  Compass,
  PlusSquare,
  Bell,
  MessageCircle,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  Radio,
  Settings as Settings2,
} from "lucide-react";
import AuthPage from "./Auth";
import { configured } from "./config";
import { authService } from "./services/auth";
import { api } from "./services/api";
import { safeNextPath } from "./services/auth-core.mjs";
import { go, type Profile, errorText } from "./lib";
import { Brand, Avatar, Loading, ErrorBox } from "./ui";
import { useLoad } from "./hooks";
import Feed, { SinglePost } from "./Feed";
const Composer = lazy(() => import("./Composer"));
const ProfilePage = lazy(() => import("./Profiles"));
const Explore = lazy(() => import("./Explore"));
const Saved = lazy(() => import("./Saved"));
const Notifications = lazy(() => import("./Notifications"));
const Messages = lazy(() => import("./Messages"));
const LivePage = lazy(() => import("./Live"));
const SettingsPage = lazy(() => import("./Settings"));
import { useIncomingCalls, CallRoom, IncomingCallBanner, callInvite, cancelInvite } from "./Call";
export default function App() {
  const callback = location.pathname === "/auth/callback";
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(
    location.pathname === "/auth/recovery",
  );
  const [path, setPath] = useState(location.pathname);
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem("octgram-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("octgram-theme", theme);
  }, [theme]);
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (!configured) return;
    const queryError = new URLSearchParams(location.search).get("error_description");
    if (queryError) setError(queryError);
    authService.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
      if (callback && data.session) {
        const next = safeNextPath(sessionStorage.getItem("octgram-auth-next"));
        sessionStorage.removeItem("octgram-auth-next");
        go(next);
      }
    });
    const {
      data: { subscription },
    } = authService.onAuthStateChange((event, s) => {
      setSession(s);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_IN" && callback && s) go(safeNextPath(sessionStorage.getItem("octgram-auth-next")));
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!configured)
    return (
      <div className="setup">
        <Brand />
        <Loading />
      </div>
    );
  if (!ready) return <Loading />;
  if (error)
    return <ErrorBox message={error} retry={() => location.reload()} />;
  if (callback && !session) return <Loading />;
  if (!session || recovery)
    return (
      <AuthPage
        recovery={recovery && !!session}
        onRecovered={() => {
          setRecovery(false);
          go("/");
        }}
      />
    );
  return (
    <Shell
      key={session.user.id}
      session={session}
      path={path}
      theme={theme}
      toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
    />
  );
}
function Shell({
  session,
  path,
  theme,
  toggleTheme,
}: {
  session: Session;
  path: string;
  theme: string;
  toggleTheme: () => void;
}) {
  const uid = session.user.id;
  const me = useLoad(
    () => api.me() as Promise<Profile & { follower_count: number }>,
    [uid],
  );
  const [error, setError] = useState("");
  const [invite, setInvite] = useIncomingCalls(uid);
  const [activeCall, setActiveCall] = useState<{ callId: string; peer: Profile; isCaller: boolean } | null>(null);
  const p = me.value;
  const nav = [
    { path: "/", label: "Beranda", icon: Home },
    { path: "/explore", label: "Jelajahi", icon: Compass },
    { path: "/create", label: "Buat postingan", icon: PlusSquare },
    { path: "/live", label: "Live", icon: Radio },
    { path: "/notifications", label: "Notifikasi", icon: Bell },
    { path: "/messages", label: "Pesan", icon: MessageCircle },
  ];
  if (me.busy) return <Loading />;
  if (me.error || !p)
    return (
      <div className="setup">
        <ErrorBox
          message={
            me.error ||
            "Profil belum tersedia. Jalankan migrasi sebelum membuat akun."
          }
          retry={me.reload}
        />
        <button onClick={() => void authService.signOut()}>Keluar</button>
      </div>
    );
  let content;
  if (path === "/") content = <Feed uid={uid} />;
  else if (path === "/create") content = <Composer uid={uid} followerCount={p.follower_count} />;
  else if (path === "/explore" || path === "/search")
    content = <Explore uid={uid} />;
  else if (path === "/saved") content = <Saved uid={uid} />;
  else if (path === "/archived") content = <Saved uid={uid} archived />;
  else if (path === "/settings") content = <SettingsPage username={p.username} />;
  else if (path === "/live" || /^\/live\/\d+$/.test(path))
    content = <LivePage id={path === "/live" ? undefined : Number(path.split("/")[2])} me={p} />;
  else if (path === "/notifications") content = <Notifications uid={uid} />;
  else if (path.startsWith("/profile/"))
    content = (
      <ProfilePage
        key={path}
        username={decodeURIComponent(path.slice(9))}
        uid={uid}
        onUpdate={me.reload}
      />
    );
  else if (path === "/messages" || path.startsWith("/messages/"))
    content = (
      <Messages
        uid={uid}
        conversationId={path.split("/")[2]}
        onStartCall={(peer) => {
          const callId = crypto.randomUUID();
          callInvite(peer.id, uid, p, callId);
          setActiveCall({ callId, peer, isCaller: true });
        }}
      />
    );
  else if (/^\/post\/\d+$/.test(path))
    content = <SinglePost id={Number(path.split("/")[2])} uid={uid} />;
  else if (/^\/post\/\d+\/likes$/.test(path)) {
    const id = Number(path.split("/")[2]);
    const likes = useLoad(() => api.postLikes(id), [id]);
    content = (
      <div className="feed-column">
        <h1>Siapa yang suka</h1>
        <button className="bare" onClick={() => go(`/post/${id}`)}>
          ← Kembali ke postingan
        </button>
        {likes.busy ? <Loading /> : likes.error ? (
          <ErrorBox message={likes.error} retry={likes.reload} />
        ) : likes.value && likes.value.length ? (
          <>
            <p className="text-muted">{likes.value.length} orang menyukai postingan ini</p>
            <div className="like-grid">
              {likes.value.map((entry) => (
                <div key={entry.user.id} className="like-user" onClick={() => go(`/profile/${entry.user.username}`)}>
                  <Avatar p={entry.user} size={48} />
                  <small>{entry.user.username}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted">Belum ada yang suka.</p>
        )}
      </div>
    );
  } else if (/^\/profile\/[^/]+\/followers$/.test(path) || /^\/profile\/[^/]+\/following$/.test(path)) {
    const parts = path.split("/");
    const username = decodeURIComponent(parts[2]);
    const kind = parts[3] === "followers" ? "followers" : "following";
    const title = kind === "followers" ? "Pengikut" : "Mengikuti";
    const q2 = useLoad(() => api.followList(username, kind), [username, kind]);
    content = (
      <div className="feed-column">
        <h1>{title}</h1>
        <button className="bare" onClick={() => go(`/profile/${username}`)}>
          ← Kembali ke profil
        </button>
        {q2.busy ? <Loading /> : q2.error ? (
          <ErrorBox message={q2.error} retry={q2.reload} />
        ) : q2.value?.length ? (
          <div className="follow-list">
            {q2.value.map((entry) => (
              <div key={entry.user.id} className="follow-row" onClick={() => go(`/profile/${entry.user.username}`)}>
                <Avatar p={entry.user} size={44} />
                <div>
                  <strong>{entry.user.display_name || entry.user.username}</strong>
                  <small className="muted">@{entry.user.username}</small>
                </div>
                <button className="bare">
                  <MessageCircle size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">
            {kind === "followers" ? "Belum ada pengikut." : "Belum ada yang diikuti."}
          </p>
        )}
      </div>
    );
  } else if (path === "/db-stats") {
    const ds = useLoad(() => api.dbStats(), []);
    content = (
      <div className="feed-column">
        <h1>Monitor database</h1>
        <p className="text-muted">Halaman ini bersifat internal.</p>
        {ds.busy ? <Loading /> : ds.error ? (
          <ErrorBox message={ds.error} retry={ds.reload} />
        ) : ds.value ? (
          <div className="db-stats">
            <div className="db-stat-card">
              <h3>Akun</h3>
              <div className="db-stat-row"><span>Total pengguna</span><b>{String(ds.value.users)}</b></div>
              <div className="db-stat-row"><span>Akun hidup (bypass 100 followers)</span><b>{String(ds.value.qualified_users)}</b></div>
            </div>
            <div className="db-stat-card">
              <h3>Konten</h3>
              <div className="db-stat-row"><span>Total postingan</span><b>{String(ds.value.posts)}</b></div>
              <div className="db-stat-row"><span>Postingan arsip</span><b>{String(ds.value.archived)}</b></div>
            </div>
            <div className="db-stat-card">
              <h3>Interaksi</h3>
              <div className="db-stat-row"><span>Total suka</span><b>{String(ds.value.likes)}</b></div>
              <div className="db-stat-row"><span>Total komentar</span><b>{String(ds.value.comments)}</b></div>
              <div className="db-stat-row"><span>Total repost</span><b>{String(ds.value.reposts)}</b></div>
            </div>
            <div className="db-stat-card">
              <h3>Koneksi</h3>
              <div className="db-stat-row"><span>Total follow (mengikuti)</span><b>{String(ds.value.follows)}</b></div>
              <div className="db-stat-row"><span>Postingan terbanyak</span><b>{String(ds.value.top_poster)}</b></div>
            </div>
          </div>
        ) : null}
      </div>
    );
  } else
    content = (
      <div className="empty">
        <h1>Halaman tidak ditemukan</h1>
        <button onClick={() => go("/")}>Ke beranda</button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="bare brand-button" onClick={() => go("/")}>
          <Brand />
        </button>
        <nav aria-label="Navigasi utama">
          {nav.map((n) => (
            <button
              key={n.path}
              className={
                "nav-item " +
                (path === n.path ||
                (n.path === "/messages" && path.startsWith("/messages/"))
                  ? "active"
                  : "")
              }
              onClick={() => go(n.path)}
            >
              <n.icon size={23} />
              <span>{n.label}</span>
            </button>
          ))}
          <button
            className={
              "nav-item " + (path === "/profile/" + p.username ? "active" : "")
            }
            onClick={() => go("/profile/" + p.username)}
          >
            <Avatar p={p} size={25} />
            <span>Profil saya</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => go("/settings")}>
            <Settings2 size={22} />
            <span>Pengaturan</span>
          </button>
          <button className="nav-item" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={22} /> : <Moon size={22} />}
            <span>{theme === "dark" ? "Mode terang" : "Mode gelap"}</span>
          </button>
          <button
            className="nav-item"
            onClick={async () => {
              try {
                const { error } = await authService.signOut();
                if (error) throw error;
                go("/");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut size={21} />
            <span>Keluar</span>
          </button>
          <div className="sidebar-me">
            <Avatar p={p} />
            <span>
              <b>{p.display_name}</b>
              <small>@{p.username}</small>
            </span>
          </div>
          <small className="copyright">
            © {new Date().getFullYear()} Octgram
          </small>
        </div>
      </aside>
      <header className="mobile-header">
        <Brand />
        <button aria-label="Ganti tema" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>
      <main className={path === "/" ? "main with-rail" : "main"}>
        {error && <ErrorBox message={error} />}
        <Suspense fallback={<Loading />}>{content}</Suspense>
        {path === "/" && (
          <aside className="right-rail">
            <button
              className="bare user"
              onClick={() => go("/profile/" + p.username)}
            >
              <Avatar p={p} size={50} />
              <span>
                <strong>{p.display_name}</strong>
                <small>@{p.username}</small>
              </span>
            </button>
            <div className="rail-card">
              <span className="eyebrow">LINGKARANMU</span>
              <h2>
                Cerita lebih seru
                <br />
                bersama teman.
              </h2>
              <p>Temukan orang yang kamu kenal dan ikuti momen mereka.</p>
              <button onClick={() => go("/explore")}>
                Cari teman
                <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="rail-footer">
              <span className="palette-line" />
              <p>
                Ruang untuk foto,
                <br />
                cerita, dan percakapanmu.
              </p>
              <small>OCTGRAM · SEJAK 2026</small>
            </div>
          </aside>
        )}
      </main>
      {invite && !activeCall && (
        <IncomingCallBanner
          invite={invite}
          onAccept={() => { setActiveCall({ callId: invite.callId, peer: invite.fromProfile, isCaller: false }); setInvite(null); }}
          onDecline={() => {
            const id = invite.callId;
            const from = invite.from;
            setInvite(null);
            const channel = (async () => {
              const { db: database } = await import("./lib");
              const ch = database.channel(`call:${id}`);
              ch.subscribe((s) => {
                if (s === "SUBSCRIBED") {
                  void ch.send({ type: "broadcast", event: "signal", payload: { type: "decline", from: uid } });
                  setTimeout(() => void database.removeChannel(ch), 1200);
                }
              });
            })();
            void channel;
            void from;
          }}
        />
      )}
      {activeCall && (
        <CallRoom
          uid={uid}
          me={p}
          peer={activeCall.peer}
          callId={activeCall.callId}
          isCaller={activeCall.isCaller}
          onClose={() => {
            if (activeCall.isCaller) cancelInvite(activeCall.peer.id, activeCall.callId);
            setActiveCall(null);
          }}
        />
      )}
    </div>
  );
}
