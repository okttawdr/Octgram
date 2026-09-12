import { useEffect, useState } from "react";
import { ArrowLeft, Archive, Bell, Bookmark, ChevronRight, Database, HelpCircle, KeyRound, LogOut, Moon, Palette, ShieldCheck, Smartphone, Sun, UserCog } from "lucide-react";
import { go } from "./lib";
import { authService } from "./services/auth";

type Section = "account" | "appearance" | "notifications" | "security" | "help";

export default function Settings({ username, email, isAdmin, theme, toggleTheme }: { username: string; email: string; isAdmin: boolean; theme: string; toggleTheme: () => void }) {
  const [section, setSection] = useState<Section>("account");
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("octgram-reduced-motion") === "1");
  const [notificationStatus, setNotificationStatus] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
    localStorage.setItem("octgram-reduced-motion", reducedMotion ? "1" : "0");
  }, [reducedMotion]);

  const navigation: { id: Section; label: string; description: string; icon: typeof UserCog }[] = [
    { id: "account", label: "Akun", description: "Profil dan kontenmu", icon: UserCog },
    { id: "appearance", label: "Tampilan", description: "Tema dan gerakan", icon: Palette },
    { id: "notifications", label: "Notifikasi", description: "Izin perangkat", icon: Bell },
    { id: "security", label: "Keamanan", description: "Sesi dan akses", icon: ShieldCheck },
    { id: "help", label: "Bantuan", description: "Tentang Octgram", icon: HelpCircle },
  ];

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    setNotificationStatus(await Notification.requestPermission());
  }

  return (
    <div className="settings-page settings-pro">
      <header className="settings-heading">
        <button className="back-round" onClick={() => (history.length > 1 ? history.back() : go("/"))} aria-label="Kembali"><ArrowLeft size={19} /></button>
        <div><span className="eyebrow">PREFERENSI OCTGRAM</span><h1>Pengaturan</h1></div>
      </header>
      <div className="settings-layout">
        <aside className="panel settings-nav" aria-label="Bagian pengaturan">
          <div className="settings-identity"><span className="settings-avatar">{username.slice(0, 1).toUpperCase()}</span><span><strong>@{username}</strong><small>{email}</small></span></div>
          {navigation.map((item) => (
            <button key={item.id} className={`settings-nav-item ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}>
              <span className="settings-nav-icon"><item.icon size={19} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={16} />
            </button>
          ))}
          {isAdmin && <button className="settings-nav-item internal" onClick={() => go("/internal/overview")}><span className="settings-nav-icon"><Database size={19} /></span><span><strong>System overview</strong><small>Area administrator</small></span><ChevronRight size={16} /></button>}
        </aside>

        <section className="panel settings-content">
          {section === "account" && <><SettingsTitle title="Akun dan konten" text="Kelola identitas serta koleksi pribadi dalam satu tempat." /><SettingsLink icon={UserCog} title="Edit profil" text="Ubah foto, nama, bio, username, dan tautan." onClick={() => go(`/profile/${username}?edit=1`)} /><SettingsLink icon={Bookmark} title="Postingan tersimpan" text="Lihat kembali postingan yang kamu simpan." onClick={() => go("/saved")} /><SettingsLink icon={Archive} title="Arsip postingan" text="Pulihkan atau tinjau konten yang disembunyikan." onClick={() => go("/archived")} /></>}
          {section === "appearance" && <><SettingsTitle title="Tampilan Octgram" text="Sesuaikan antarmuka agar nyaman di perangkatmu." /><button className="settings-control" onClick={toggleTheme}><span className="settings-control-icon">{theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}</span><span><strong>Mode {theme === "dark" ? "gelap" : "terang"}</strong><small>Ketuk untuk beralih ke mode {theme === "dark" ? "terang" : "gelap"}.</small></span><span className={`switch ${theme === "dark" ? "on" : ""}`} aria-hidden><i /></span></button><button className="settings-control" onClick={() => setReducedMotion((v) => !v)}><span className="settings-control-icon"><Smartphone size={20} /></span><span><strong>Kurangi animasi</strong><small>Batasi transisi untuk pengalaman yang lebih tenang.</small></span><span className={`switch ${reducedMotion ? "on" : ""}`} aria-hidden><i /></span></button></>}
          {section === "notifications" && <><SettingsTitle title="Notifikasi perangkat" text="Izinkan browser menampilkan pembaruan penting dari Octgram." /><div className="settings-status-card"><span className={`status-dot ${notificationStatus}`} /><div><strong>Status browser</strong><small>{notificationStatus === "granted" ? "Notifikasi sudah diizinkan." : notificationStatus === "denied" ? "Notifikasi diblokir dari pengaturan browser." : notificationStatus === "unsupported" ? "Browser ini tidak mendukung notifikasi." : "Izin notifikasi belum diberikan."}</small></div>{notificationStatus === "default" && <button className="primary" onClick={() => void enableNotifications()}>Aktifkan</button>}</div><p className="settings-note">Notifikasi aktivitas di dalam aplikasi tetap muncul pada menu Notifikasi.</p></>}
          {section === "security" && <><SettingsTitle title="Login dan keamanan" text="Periksa akun aktif dan akhiri sesi bila diperlukan." /><div className="settings-session"><span className="settings-control-icon"><KeyRound size={20} /></span><span><strong>Sesi saat ini</strong><small>{email} · {navigator.platform || "Perangkat ini"}</small></span><span className="session-current">AKTIF</span></div><button className="settings-danger" onClick={() => void authService.signOut()}><LogOut size={18} /><span><strong>Keluar dari Octgram</strong><small>Akhiri sesi pada perangkat ini.</small></span></button></>}
          {section === "help" && <><SettingsTitle title="Bantuan dan informasi" text="Informasi singkat tentang pengalaman Octgram." /><div className="about-octgram"><span className="about-mark">O</span><div><h2>Octgram</h2><p>Ruang berbagi foto, percakapan, dan siaran langsung dengan identitas biru khas Octgram.</p><small>Versi aplikasi 2.1.0</small></div></div><div className="settings-security-note"><ShieldCheck size={19} /><p>Media sekali lihat di percakapan disimpan secara privat melalui Supabase dan dihapus setelah penerima selesai melihatnya.</p></div></>}
        </section>
      </div>
    </div>
  );
}

function SettingsTitle({ title, text }: { title: string; text: string }) { return <header className="settings-section-title"><h2>{title}</h2><p>{text}</p></header>; }
function SettingsLink({ icon: Icon, title, text, onClick }: { icon: typeof UserCog; title: string; text: string; onClick: () => void }) { return <button className="settings-control" onClick={onClick}><span className="settings-control-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight size={17} /></button>; }
