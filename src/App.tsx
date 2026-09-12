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
  Database,
  Users,
  Images,
  Heart,
  MessagesSquare,
  Activity,
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
  const isAdmin = ["okttawdr@gmail.com", "shusensei27@gmail.com"].includes((session.user.email || "").toLowerCase());
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
  else if (path === "/settings") content = (
    <SettingsPage
      username={p.username}
      email={session.user.email || ""}
      isAdmin={isAdmin}
      theme={theme}
      toggleTheme={toggleTheme}
    />
  );
  else if (path === "/live" || /^\/live\/\d+$/.test(path))
    content = <LivePage id={path === "/live" ? undefined : Number(path.split("/")[2])} me={p} canStartLive={isAdmin} />;
  else if (path === "/notifications") content = <Notifications uid={uid} />;
  else if (path.startsWith("/profile/") && !/\/(followers|following)$/.test(path))
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
  else if (/^\/post\/\d+\/likes$/.test(path))
    content = <PostLikesPage id={Number(path.split("/")[2])} />;
  else if (/^\/profile\/[^/]+\/followers$/.test(path) || /^\/profile\/[^/]+\/following$/.test(path)) {
    const parts = path.split("/");
    const username = decodeURIComponent(parts[2]);
    const kind = parts[3] === "followers" ? "followers" : "following";
    content = <FollowListPage username={username} kind={kind} />;
  } else if (path === "/internal/overview" || path === "/db-stats")
    content = <DatabaseOverview isAdmin={isAdmin} />;
  else
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

function PostLikesPage({ id }: { id: number }) {
  const likes = useLoad(() => api.postLikes(id), [id]);
  return (
    <div className="social-list-page">
      <header className="subpage-head">
        <button className="back-round" aria-label="Kembali" onClick={() => go(`/post/${id}`)}>←</button>
        <div><span className="eyebrow">AKTIVITAS POSTINGAN</span><h1>Disukai oleh</h1></div>
      </header>
      <section className="panel social-list-panel">
        {likes.busy ? <Loading /> : likes.error ? (
          <ErrorBox message={likes.error} retry={likes.reload} />
        ) : likes.value?.length ? likes.value.map((entry) => (
          <button key={entry.user.id} className="social-person" onClick={() => go(`/profile/${entry.user.username}`)}>
            <Avatar p={entry.user} size={48} />
            <span><strong>{entry.user.display_name || entry.user.username}</strong><small>@{entry.user.username}</small></span>
            <span className="social-person-action">Lihat profil</span>
          </button>
        )) : <p className="empty-inbox">Belum ada yang menyukai postingan ini.</p>}
      </section>
    </div>
  );
}

function FollowListPage({ username, kind }: { username: string; kind: "followers" | "following" }) {
  const list = useLoad(() => api.followList(username, kind), [username, kind]);
  const title = kind === "followers" ? "Pengikut" : "Mengikuti";
  return (
    <div className="social-list-page">
      <header className="subpage-head">
        <button className="back-round" aria-label="Kembali" onClick={() => go(`/profile/${username}`)}>←</button>
        <div><span className="eyebrow">@{username}</span><h1>{title}</h1></div>
      </header>
      <section className="panel social-list-panel">
        {list.busy ? <Loading /> : list.error ? (
          <ErrorBox message={list.error} retry={list.reload} />
        ) : list.value?.length ? list.value.map((entry) => (
          <button key={entry.user.id} className="social-person" onClick={() => go(`/profile/${entry.user.username}`)}>
            <Avatar p={entry.user} size={48} />
            <span><strong>{entry.user.display_name || entry.user.username}</strong><small>@{entry.user.username}</small></span>
            <span className="social-person-action">Lihat profil</span>
          </button>
        )) : <p className="empty-inbox">{kind === "followers" ? "Belum ada pengikut." : "Belum mengikuti siapa pun."}</p>}
      </section>
    </div>
  );
}

function DatabaseOverview({ isAdmin }: { isAdmin: boolean }) {
  const stats = useLoad(() => isAdmin ? api.dbStats() : Promise.resolve({ allowed: false }), [isAdmin]);
  const value = stats.value;
  if (!isAdmin || (value && value.allowed !== true)) {
    return <div className="empty"><Database size={38} /><h1>Akses terbatas</h1><p>Halaman internal ini hanya tersedia untuk administrator Octgram.</p><button onClick={() => go("/")}>Ke beranda</button></div>;
  }
  const cards = value ? [
    { label: "Pengguna", value: value.profiles, icon: Users },
    { label: "Postingan aktif", value: Number(value.posts || 0) - Number(value.archived_posts || 0), icon: Images },
    { label: "Interaksi", value: Number(value.likes || 0) + Number(value.comments || 0) + Number(value.reposts || 0), icon: Heart },
    { label: "Pesan", value: value.messages, icon: MessagesSquare },
  ] : [];
  return (
    <div className="admin-dashboard">
      <header className="admin-hero">
        <div><span className="admin-badge"><Activity size={14} /> INTERNAL</span><h1>Database overview</h1><p>Pantau kondisi inti Octgram langsung dari data Supabase.</p></div>
        <button onClick={stats.reload}>Perbarui data</button>
      </header>
      {stats.busy ? <Loading /> : stats.error ? <ErrorBox message={stats.error} retry={stats.reload} /> : value && (
        <>
          <div className="admin-metrics">{cards.map((card) => <article key={card.label} className="admin-metric"><span><card.icon size={20} /></span><small>{card.label}</small><strong>{Number(card.value || 0).toLocaleString("id-ID")}</strong></article>)}</div>
          <section className="panel admin-details">
            <h2>Rincian sistem</h2>
            <div className="admin-detail-grid">
              <div><span>Postingan</span><b>{String(value.posts ?? 0)}</b></div><div><span>Diarsipkan</span><b>{String(value.archived_posts ?? 0)}</b></div>
              <div><span>Suka</span><b>{String(value.likes ?? 0)}</b></div><div><span>Komentar</span><b>{String(value.comments ?? 0)}</b></div>
              <div><span>Repost</span><b>{String(value.reposts ?? 0)}</b></div><div><span>Mengikuti</span><b>{String(value.follows ?? 0)}</b></div>
              <div><span>Percakapan</span><b>{String(value.conversations ?? 0)}</b></div><div><span>Live tercatat</span><b>{String(value.live_streams ?? 0)}</b></div>
              <div><span>Pengguna baru 7 hari</span><b>{String(value.new_users_7d ?? 0)}</b></div><div><span>Postingan 24 jam</span><b>{String(value.new_posts_24h ?? 0)}</b></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
