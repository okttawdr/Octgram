import { ArrowLeft, Bookmark, Archive } from "lucide-react";
import Feed from "./Feed";
import { go } from "./lib";

export default function Saved({ uid, archived = false }: { uid: string; archived?: boolean }) {
  return (
    <div className="saved-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">{archived ? "TERSEMBUNYI DARI ORANG LAIN" : "KOLEKSI PRIBADI"}</p>
          <h1>{archived ? "Postingan diarsipkan" : "Postingan tersimpan"}</h1>
        </div>
        <button onClick={() => history.length > 1 ? history.back() : go("/")}>
          <ArrowLeft size={18} /> Kembali
        </button>
      </header>
      <div className="privacy-note">
        {archived ? <Archive size={18} /> : <Bookmark size={18} />}
        {archived ? "Hanya kamu yang dapat melihat postingan yang diarsipkan." : "Hanya kamu yang dapat melihat koleksi ini."}
      </div>
      <Feed uid={uid} variant={archived ? "archived" : "saved"} />
    </div>
  );
}
