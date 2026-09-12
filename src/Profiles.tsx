import { useState } from "react";
import { Search, MessageCircle, Camera, Bookmark, X } from "lucide-react";
import {
  db,
  errorText,
  go,
  invalidateFeed,
  photo,
  type Profile,
} from "./lib";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { Avatar, User, Action, Loading, ErrorBox, Empty } from "./ui";
import Feed from "./Feed";
import { processImage, uploadImage } from "./images";
import { AvatarCropper } from "./AvatarCropper";
export function SearchPeople({ embedded = false }: { embedded?: boolean }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const q = useLoad(
    () => query.length < 2 ? Promise.resolve([]) : api.searchProfiles(query.replace(/[^a-z0-9_]/g, "")),
    [query],
  );
  return (
    <div className={embedded ? "embedded-search" : "narrow"}>
      {!embedded && (
        <header className="page-title">
          <div>
            <p className="eyebrow">TEMUKAN KONEKSIMU</p>
            <h1>Cari pengguna</h1>
          </div>
        </header>
      )}
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.toLowerCase().replace(/^@/, ""));
        }}
      >
        <Search size={20} />
        <input
          aria-label="Cari username"
          placeholder="Cari username…"
          minLength={2}
          maxLength={24}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
        />
        <button className="primary">Cari</button>
      </form>
      <p className="hint">
        Ketik minimal 2 karakter awal username. Maksimal 20 hasil per pencarian.
      </p>
      {q.busy ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox message={q.error} retry={q.reload} />
      ) : q.value?.length ? (
        <div className="panel people">
          {q.value.map((p) => (
            <User key={p.id} p={p} />
          ))}
        </div>
      ) : embedded && !query ? null : (
        <Empty
          title={
            query ? "Pengguna belum ditemukan" : "Siapa yang ingin kamu ikuti?"
          }
        >
          <p>
            {query
              ? "Coba awalan username lain."
              : "Cari teman, buka profilnya, lalu ikuti."}
          </p>
        </Empty>
      )}
    </div>
  );
}
export default function ProfilePage({
  username,
  uid,
  onUpdate,
}: {
  username: string;
  uid: string;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get("edit") === "1");
  const q = useLoad(async () => {
    const profile = await api.profile(username);
    return {
      profile,
      followers: profile.follower_count,
      following: profile.following_count,
      followed: profile.is_following,
      posts: profile.post_count,
    };
  }, [username, uid]);
  const [preview, setPreview] = useState(false);
  if (q.busy) return <Loading />;
  if (q.error)
    return (
      <ErrorBox
        message="Profil tidak tersedia. Periksa username atau coba lagi."
        retry={q.reload}
      />
    );
  if (!q.value) return null;
  const { profile: p, followed } = q.value;
  return (
    <div className="profile-page">
      <section className="profile-header panel">
        <div className="profile-cover" />
        <div className="profile-info">
          <button className="bare avatar-trigger" onClick={() => setPreview(true)} aria-label="Lihat foto profil">
            <Avatar p={p} size={96} />
          </button>
          {preview && (
            <div className="modal-backdrop" role="dialog" aria-modal aria-label="Foto profil">
              <div className="avatar-preview">
                <button className="bare avatar-preview-close" onClick={() => setPreview(false)} aria-label="Tutup">
                  <X size={22} />
                </button>
                {p.avatar_path ? (
                  <img src={photo(p.avatar_path)} alt={p.username} />
                ) : (
                  <Avatar p={p} size={220} />
                )}
              </div>
            </div>
          )}
          <div className="profile-heading">
            <div>
              <h1>{p.display_name || p.username}</h1>
              <p className="muted">@{p.username}</p>
            </div>
            <div className="row">
              {p.id === uid ? (
                <>
                  <button onClick={() => setEditing(true)}>Edit profil</button>
                  <button onClick={() => go("/saved")}>
                    <Bookmark size={17} /> Tersimpan
                  </button>
                </>
              ) : (
                <>
                  <Action
                    className={followed ? "" : "primary"}
                    run={async () => {
                      await api.setFollow(p.id, !followed);
                      q.reload();
                    }}
                  >
                    {followed ? "Mengikuti" : "Ikuti"}
                  </Action>
                  <Action
                    run={async () => {
                      const id = await api.startChat(p.id);
                      go("/messages/" + id);
                    }}
                  >
                    <MessageCircle size={18} />
                    Pesan
                  </Action>
                </>
              )}
            </div>
          </div>
          <p className="bio">{p.bio}</p>
          {p.website && (
            <a
              className="accent"
              href={p.website}
              target="_blank"
              rel="noreferrer noopener"
            >
              {p.website.replace("https://", "")}
            </a>
          )}
          <div className="profile-stats">
            <span>
              <b>{q.value.posts}</b> postingan
            </span>
            <button className="bare stat-link" onClick={() => go(`/profile/${p.username}/followers`)}>
              <b>{q.value.followers}</b> pengikut
            </button>
            <button className="bare stat-link" onClick={() => go(`/profile/${p.username}/following`)}>
              <b>{q.value.following}</b> mengikuti
            </button>
          </div>
        </div>
      </section>
      {editing && (
        <EditProfile
          profile={p}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onUpdate();
            go("/profile/" + next);
            q.reload();
          }}
        />
      )}
      <h2 className="section-label">
        <Camera size={18} />
        Foto
      </h2>
      <Feed key={p.id} uid={uid} authorId={p.id} />
    </div>
  );
}
function EditProfile({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (username: string) => void;
}) {
  const [p, setP] = useState({ ...profile });
  const [file, setFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<{ zoom: number; offsetX: number; offsetY: number; url: string } | null>(null);
  const [picking, setPicking] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let uploaded: string | null = null;
    try {
      let avatar = p.avatar_path;
      if (file) {
        const image = await processImage(file, {
          crop: "square",
          rotation: 0,
          maxEdge: 320,
          zoom: crop?.zoom ?? 1,
          offsetX: crop?.offsetX ?? 0,
          offsetY: crop?.offsetY ?? 0,
        });
        uploaded = p.id + "/" + crypto.randomUUID() + ".webp";
        await uploadImage(uploaded, image.blob, () => {});
        avatar = uploaded;
      }
      await api.updateProfile({
        username: p.username.toLowerCase(), display_name: p.display_name,
        bio: p.bio, website: p.website, avatar_path: avatar,
      });
      if (uploaded && profile.avatar_path)
        await db.storage.from("photos").remove([profile.avatar_path]);
      invalidateFeed();
      onSaved(p.username.toLowerCase());
    } catch (e) {
      if (uploaded) await db.storage.from("photos").remove([uploaded]);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel edit-profile">
      <h2>Edit profil</h2>
      <form onSubmit={save}>
        <label className="avatar-picker">
          <span>Foto profil</span>
          <div className="avatar-picker-preview">
            <img src={crop?.url || (p.avatar_path ? photo(p.avatar_path) : "")} alt="" />
            <span className="avatar-picker-badge">
              <Camera size={16} />
            </span>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setCrop(null);
              if (f) setPicking(f);
              e.target.value = "";
            }}
          />
        </label>
        {picking && (
          <AvatarCropper
            file={picking}
            onCancel={() => { setPicking(null); setFile(null); }}
            onDone={(state) => { setCrop(state); setPicking(null); }}
          />
        )}
        <label>
          Username
          <input
            required
            pattern="[a-z0-9_]{3,24}"
            minLength={3}
            maxLength={24}
            value={p.username}
            onChange={(e) =>
              setP({ ...p, username: e.target.value.toLowerCase() })
            }
          />
          <small>3–24 karakter, huruf kecil, angka, atau garis bawah.</small>
        </label>
        <label>
          Nama tampilan
          <input
            maxLength={60}
            required
            value={p.display_name}
            onChange={(e) => setP({ ...p, display_name: e.target.value })}
          />
        </label>
        <label>
          Bio
          <textarea
            maxLength={160}
            value={p.bio}
            onChange={(e) => setP({ ...p, bio: e.target.value })}
          />
        </label>
        <label>
          Website
          <input
            type="url"
            maxLength={2048}
            placeholder="https://"
            pattern="https://.*"
            value={p.website}
            onChange={(e) => setP({ ...p, website: e.target.value })}
          />
        </label>
        {error && <ErrorBox message={error} />}
        <div className="row">
          <button type="button" disabled={busy} onClick={onClose}>
            Batal
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan profil"}
          </button>
        </div>
      </form>
    </section>
  );
}
