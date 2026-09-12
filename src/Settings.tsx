import { ArrowLeft, Bookmark, Archive, UserCog, LogOut, ChevronRight } from "lucide-react";
import { go } from "./lib";
import { authService } from "./services/auth";

export default function Settings({ username }: { username: string }) {
  const items = [
    { icon: UserCog, label: "Edit profil", onClick: () => go(`/profile/${username}?edit=1`) },
    { icon: Bookmark, label: "Postingan tersimpan", onClick: () => go("/saved") },
    { icon: Archive, label: "Postingan diarsipkan", onClick: () => go("/archived") },
  ];
  return (
    <div className="settings-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">AKUN</p>
          <h1>Pengaturan</h1>
        </div>
        <button onClick={() => (history.length > 1 ? history.back() : go("/"))}>
          <ArrowLeft size={18} /> Kembali
        </button>
      </header>
      <div className="settings-list panel">
        {items.map((it) => (
          <button key={it.label} className="settings-item" onClick={it.onClick}>
            <it.icon size={18} />
            <span>{it.label}</span>
            <ChevronRight size={16} className="settings-chevron" />
          </button>
        ))}
        <button className="settings-item danger" onClick={() => void authService.signOut()}>
          <LogOut size={18} />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );
}
