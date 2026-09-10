import { ArrowLeft, Bookmark } from "lucide-react";
import Feed from "./Feed";
import { go } from "./lib";

export default function Saved({ uid }: { uid: string }) {
  return (
    <div className="saved-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">KOLEKSI PRIBADI</p>
          <h1>Postingan tersimpan</h1>
        </div>
        <button onClick={() => history.length > 1 ? history.back() : go("/")}>
          <ArrowLeft size={18} /> Kembali
        </button>
      </header>
      <div className="privacy-note">
        <Bookmark size={18} /> Hanya kamu yang dapat melihat koleksi ini.
      </div>
      <Feed uid={uid} variant="saved" />
    </div>
  );
}
