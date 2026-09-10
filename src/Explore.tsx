import { Compass } from "lucide-react";
import Feed from "./Feed";
import { SearchPeople } from "./Profiles";

export default function Explore({ uid }: { uid: string }) {
  return (
    <div className="explore-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">TEMUKAN HAL BARU</p>
          <h1>Jelajahi</h1>
        </div>
        <span className="page-symbol" aria-hidden="true">
          <Compass size={22} />
        </span>
      </header>
      <section className="explore-search" aria-label="Pencarian pengguna">
        <SearchPeople embedded />
      </section>
      <section aria-labelledby="latest-stories">
        <h2 className="section-label" id="latest-stories">
          Cerita terbaru dari komunitas
        </h2>
        <Feed uid={uid} variant="explore" />
      </section>
    </div>
  );
}
