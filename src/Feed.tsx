import { useEffect, useRef, useState } from "react";
import {
  Heart,
  Bookmark,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ImagePlus,
  ArrowUpRight,
  MoreHorizontal,
  Repeat2,
  Share2,
  Pencil,
  Archive,
  Trash2,
  X,
  Copy,
  Check,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  date,
  mediaUrl,
  go,
  errorText,
  invalidateFeed,
  type Post,
  type Profile,
} from "./lib";
import { api } from "./services/api";
import { useLoad } from "./hooks";
import { User, Avatar, ErrorBox, Loading, Empty, RichText } from "./ui";
type Comment = {
  id: number;
  body: string;
  parent_id: number | null;
  created_at: string;
  author: Profile;
};

function LikesModal({ postId, onClose }: { postId: number; onClose: () => void }) {
  const q = useLoad(() => api.postLikes(postId), [postId]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label="Siapa yang suka">
      <div className="modal-card like-modal">
        <div className="modal-header">
          <h2>Siapa yang suka</h2>
          <button className="bare" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {q.busy ? (
            <Loading />
          ) : q.error ? (
            <ErrorBox message={q.error} retry={q.reload} />
          ) : !q.value?.length ? (
            <p className="text-muted">Belum ada yang suka.</p>
          ) : (
            <>
              <div className="like-grid">
                {q.value.map((entry) => (
                  <div key={entry.user.id} className="like-user" onClick={() => go("/profile/" + entry.user.username)}>
                    <Avatar p={entry.user} size={48} />
                    <small>{entry.user.username}</small>
                  </div>
                ))}
              </div>
              <p className="text-muted text-center mt-2">
                {q.value.length} orang menyukai postingan ini
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostCard({ post, uid, onAction }: { post: Post; uid: string; onAction?: (action: string, postId: number) => void }) {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(post.liked);
  const [count, setCount] = useState(Number(post.like_count));
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [commentCount, setCommentCount] = useState(Number(post.comment_count));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const [likeList, setLikeList] = useState(false);
  const [collabList, setCollabList] = useState(false);
  const lock = useRef(false);
  const isOwner = post.user_id === uid;
  async function like(force = false) {
    if (lock.current || (force && liked)) return;
    lock.current = true;
    setBusy(true);
    setErr("");
    const next = force || !liked;
    try {
      await api.setLike(post.id, next);
      setLiked(next);
      setCount((n) => n + (next ? 1 : -1));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function bookmark() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setErr("");
    const next = !bookmarked;
    try {
      await api.setBookmark(post.id, next);
      setBookmarked(next);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const media = post.media[index];
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption || "");
  const [repostConfirm, setRepostConfirm] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [showCollabs, setShowCollabs] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const menuLock = useRef(false);
  async function openLikes() {
    setActionErr("");
    try {
      const rows = await api.postLikes(post.id);
      setShowLikes(true);
      setShowCollabs(false);
      setMenuOpen(false);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function openCollabs() {
    setActionErr("");
    try {
      const p = await api.post(post.id);
      setShowCollabs(true);
      setShowLikes(false);
      setMenuOpen(false);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doEdit() {
    setActionErr("");
    try {
      await api.editPost(post.id, { caption: captionDraft || null });
      setEditOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doArchive() {
    setActionErr("");
    try {
      await api.archivePost(post.id, true);
      setMenuOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doDelete() {
    if (!confirm(`Hapus "${post.caption?.slice(0, 60) || "postingan"}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setActionErr("");
    try {
      await api.deletePost(post.id);
      setMenuOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doRepost() {
    setActionErr("");
    try {
      await api.setRepost(post.id, true);
      setRepostConfirm(false);
      setMenuOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doShare() {
    try {
      await navigator.clipboard.writeText(`https://${window.location.host}/post/${post.id}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      /* fallback silent */
    }
    setMenuOpen(false);
  }
  async function refreshPost() {
    const q = useLoad;
    // trigger re-render via parent reload; PostCard is also used inside SinglePost which will re-fetch
  }
  function closeActionErr() { setActionErr(""); }
  return (
    <article className="post">
      <header className="post-head">
        <User p={post.author} />
        <time dateTime={post.created_at}>{date(post.created_at)}</time>
      </header>
      <div
        className="post-photo"
        onDoubleClick={() => void like(true)}
        style={{
          aspectRatio: Math.min(
            1.91,
            Math.max(0.8, media.width / media.height),
          ),
        }}
      >
        <img
          src={mediaUrl(media.path, 1080)}
          alt={post.caption || `Foto oleh ${post.author.username}`}
          loading="lazy"
          decoding="async"
          width={media.width}
          height={media.height}
        />
        {post.media.length > 1 && (
          <>
            <span className="photo-counter">
              {index + 1} / {post.media.length}
            </span>
            {index > 0 && (
              <button
                aria-label="Foto sebelumnya"
                className="carousel previous"
                onClick={() => setIndex((i) => i - 1)}
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {index < post.media.length - 1 && (
              <button
                aria-label="Foto berikutnya"
                className="carousel next"
                onClick={() => setIndex((i) => i + 1)}
              >
                <ChevronRight size={20} />
              </button>
            )}
          </>
        )}
      </div>
      <div className="post-body">
        <div className="post-actions">
          <button
            className={"bare " + (liked ? "liked" : "")}
            aria-label={liked ? "Batal menyukai" : "Sukai foto"}
            aria-pressed={liked}
            disabled={busy}
            onClick={() => void like()}
          >
            <Heart fill={liked ? "currentColor" : "none"} size={25} />
          </button>
          <button
            className="bare"
            aria-label="Buka komentar"
            onClick={() => setOpen((v) => !v)}
          >
            <MessageCircle size={25} />
          </button>
          <button
            className={"bare save-action " + (bookmarked ? "saved" : "")}
            aria-label={bookmarked ? "Hapus dari tersimpan" : "Simpan postingan"}
            aria-pressed={bookmarked}
            disabled={busy}
            onClick={() => void bookmark()}
          >
            <Bookmark fill={bookmarked ? "currentColor" : "none"} size={24} />
          </button>
          {post.media.length > 1 && (
            <div className="dots">
              {post.media.map((_, i) => (
                <button
                  key={i}
                  className={i === index ? "active" : ""}
                  aria-label={"Lihat foto " + (i + 1)}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          )}
          {isOwner && (
            <div className="action-menu-wrap">
              <button
                className={`bare ${menuOpen ? "active" : ""}`}
                aria-label="Opsi postingan"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={22} />
              </button>
              {menuOpen && (
                <div className="action-menu" role="menu">
                  <button className="action-menu-item" role="menuitem" onClick={() => { setEditOpen(true); setMenuOpen(false); }}>
                    <Pencil size={16} /> Edit
                  </button>
                  <button className="action-menu-item" role="menuitem" onClick={() => { setRepostConfirm(true); setMenuOpen(false); }}>
                    <Repeat2 size={16} /> Repost
                  </button>
                  <button className="action-menu-item" role="menuitem" onClick={() => { openLikes(); }}>
                    <Heart size={16} /> Siapa yang suka
                  </button>
                  <button className="action-menu-item" role="menuitem" onClick={() => { openCollabs(); }}>
                    <Users size={16} /> Kolaborator
                  </button>
                  <hr className="action-menu-divider" />
                  <button className="action-menu-item" role="menuitem" onClick={() => { doShare(); }}>
                    {shareCopied ? <><Check size={16} /> Tersalin</> : <><Share2 size={16} /> Bagikan</>}
                  </button>
                  <button className="action-menu-item soft" role="menuitem" onClick={() => { doArchive(); }}>
                    <Archive size={16} /> Arsipkan
                  </button>
                  <button className="action-menu-item danger" role="menuitem" onClick={() => { doDelete(); }}>
                    <Trash2 size={16} /> Hapus
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <strong>{count.toLocaleString("id-ID")} suka</strong>
        {isOwner && (
          <div className="post-actions owner-actions">
            <div className="action-menu-wrap">
              <button
                className={`bare ${menuOpen ? "active" : ""}`}
                aria-label="Opsi postingan"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={22} />
              </button>
              {menuOpen && (
                <div className="action-menu" role="menu">
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                  >
                    <Pencil size={16} /> Edit
                  </button>
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    onClick={() => { setRepostConfirm(true); setMenuOpen(false); }}
                  >
                    <Repeat2 size={16} /> Repost
                  </button>
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    onClick={() => { openLikes(); }}
                  >
                    <Heart size={16} /> Siapa yang suka
                  </button>
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    onClick={() => { openCollabs(); }}
                  >
                    <Users size={16} /> Kolaborator
                  </button>
                  <hr className="action-menu-divider" />
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    onClick={() => { doShare(); }}
                  >
                    {shareCopied ? (
                      <><Check size={16} /> Tersalin</>
                    ) : (
                      <><Share2 size={16} /> Bagikan</>
                    )}
                  </button>
                  <button
                    className="action-menu-item soft"
                    role="menuitem"
                    onClick={() => { doArchive(); }}
                  >
                    <Archive size={16} /> Arsipkan
                  </button>
                  <button
                    className="action-menu-item danger"
                    role="menuitem"
                    onClick={() => { doDelete(); }}
                  >
                    <Trash2 size={16} /> Hapus
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {post.caption && (
          <p className="caption">
            <button
              className="bare username"
              onClick={() => go("/profile/" + post.author.username)}
            >
              {post.author.username}
            </button>{" "}
            <RichText text={post.caption} />
          </p>
        )}
        <button className="bare muted" onClick={() => setOpen((v) => !v)}>
          {open
            ? "Tutup komentar"
            : commentCount
              ? `Lihat ${commentCount} komentar`
              : "Jadilah yang pertama berkomentar"}
        </button>
        {err && <ErrorBox message={err} />}
        {open && (
          <Comments
            postId={post.id}
            uid={uid}
            onAdded={() => setCommentCount((n) => n + 1)}
          />
        )}
      </div>
      {/* ===== Action modals ===== */}
      {editOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal aria-label="Edit postingan">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Edit postingan</h2>
              <button className="bare" onClick={() => setEditOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label className="text-muted" style={{ display: "block", marginBottom: 8 }}>
                Caption
              </label>
              <textarea
                className="caption-editor"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                maxLength={2200}
                rows={4}
              />
              {actionErr && <ErrorBox message={actionErr} />}
              {captionDraft !== post.caption && (
                <button className="primary mt-2" onClick={doEdit}>
                  Simpan perubahan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {repostConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal aria-label="Repost">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Repost</h2>
              <button className="bare" onClick={() => setRepostConfirm(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted">
                Apakah kamu yakin ingin mempost ulang ini ke feed-mu?
              </p>
              {actionErr && <ErrorBox message={actionErr} />}
              <div className="modal-footer">
                <button className="bare" onClick={() => setRepostConfirm(false)}>
                  Batal
                </button>
                <button className="primary" onClick={doRepost}>
                  Repost sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shareCopied && (
        <div className="toast">
          <Check size={16} /> Tersalin ke clipboard
        </div>
      )}

      {/* Likes list */}
      {showLikes && (
        <LikesModal postId={post.id} onClose={() => setShowLikes(false)} />
      )}

      {/* Collabs */}
      {showCollabs && (
        <div className="modal-backdrop" role="dialog" aria-modal aria-label="Kolaborator">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Kolaborator</h2>
              <button className="bare" onClick={() => setShowCollabs(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {post.collaborators && post.collaborators.length > 0 ? (
                <>
                  <div className="collab-list">
                    {post.collaborators.map((c) => (
                      <div key={c.id} className="collab-chip">
                        <Avatar p={c} size={24} />
                        {c.display_name || c.username}
                      </div>
                    ))}
                  </div>
                  <p className="text-muted text-center mt-2">
                    Postingan ini dibuat bersama {post.collaborators.length} orang
                  </p>
                </>
              ) : (
                <p className="text-muted">Postingan ini hanya dibuat oleh satu orang.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click-outside modal backdrop */}
      {editOpen || repostConfirm || showLikes || showCollabs ? (
        <div className="modal-backdrop" onClick={() => { setEditOpen(false); setRepostConfirm(false); setShowLikes(false); setShowCollabs(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 70 }} />
      ) : null}
    </article>
  );
}
function Comments({
  postId,
  onAdded,
}: {
  postId: number;
  uid: string;
  onAdded: () => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mounted = useRef(true);
  async function load(before?: number) {
    setLoading(true);
    setErr("");
    try {
      const data = await api.comments(postId, before) as Comment[];
      if (mounted.current) {
        setRows((old) => (before ? [...old, ...data] : data));
        setMore(data.length === 20);
      }
    } catch (e) {
      if (mounted.current) setErr(errorText(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [postId]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.addComment(postId, text, reply?.id || null);
      setText("");
      setReply(null);
      onAdded();
      await load();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="comments">
      <form onSubmit={send}>
        {reply && (
          <div className="reply-target">
            Membalas @{reply.author.username}
            <button
              type="button"
              className="bare"
              onClick={() => setReply(null)}
            >
              Batal
            </button>
          </div>
        )}
        <div className="row">
          <input
            aria-label="Komentar"
            value={text}
            maxLength={1000}
            placeholder="Tulis komentar…"
            onChange={(e) => setText(e.target.value)}
            required
          />
          <button className="accent" disabled={busy || !text.trim()}>
            Kirim
          </button>
        </div>
      </form>
      {err && <ErrorBox message={err} retry={() => void load()} />}
      {rows.map((c) => (
        <div
          className={"comment " + (c.parent_id ? "is-reply" : "")}
          key={c.id}
        >
          <User p={c.author} />
          {c.parent_id && (
            <small className="muted">
              ↳ Balasan untuk komentar #{c.parent_id}
            </small>
          )}
          <p>
            <RichText text={c.body} />
          </p>
          <div className="row">
            <small>{date(c.created_at)}</small>
            <button className="bare muted" onClick={() => setReply(c)}>
              Balas
            </button>
          </div>
        </div>
      ))}
      {loading ? (
        <Loading />
      ) : (
        more && (
          <button className="wide" onClick={() => void load(rows.at(-1)?.id)}>
            Komentar sebelumnya
          </button>
        )
      )}
    </section>
  );
}
export default function Feed({
  uid,
  authorId,
  variant = "home",
}: {
  uid: string;
  authorId?: string;
  variant?: "home" | "explore" | "saved" | "archived";
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(true);
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  async function load(before?: number) {
    const g = generation.current;
    setBusy(true);
    setError("");
    try {
      const scope = authorId ? "profile" : variant;
      const data = await api.feed(scope, before, authorId);
      if (g === generation.current) {
        setPosts((old) => (before ? [...old, ...data] : data));
        setMore(data.length === 10);
      }
    } catch (e) {
      if (g === generation.current) setError(errorText(e));
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    generation.current++;
    setPosts([]);
    void load();
    return () => {
      generation.current++;
    };
  }, [uid, authorId, variant]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || busy || !more || !posts.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void load(posts.at(-1)?.id);
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [busy, more, posts.at(-1)?.id]);
  return (
    <div className="feed-column">
      {!authorId && variant === "home" && (
        <>
          <header className="page-title">
            <div>
              <p className="eyebrow">RUANG CERITAMU</p>
              <h1>
                Beranda<span className="title-dot">.</span>
              </h1>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                invalidateFeed();
                void load();
              }}
              aria-label="Muat ulang feed"
            >
              <RefreshCw size={18} />
            </button>
          </header>
          <div className="feed-top">
            <span className="active">Mengikuti</span>
            <span>Terbaru lebih dahulu</span>
          </div>
          <button className="quick-compose" onClick={() => go("/create")}>
            <span className="compose-icon">
              <ImagePlus size={22} />
            </span>
            <span>
              Ada momen untuk dibagikan?
              <small>Tambahkan foto ke ceritamu.</small>
            </span>
            <ArrowUpRight size={22} />
          </button>
        </>
      )}
      {error && (
        <ErrorBox message={error} retry={() => void load(posts.at(-1)?.id)} />
      )}
      {authorId ? (
        <div className="profile-grid">
          {posts.map((p) => (
            <button key={p.id} className="grid-cell" onClick={() => go(`/post/${p.id}`)}>
              <img src={mediaUrl(p.media[p.thumbnail_index ?? 0]?.path ?? p.media[0].path, 300)} alt="" loading="lazy" />
              {p.media.length > 1 && <span className="grid-cell-badge">{p.media.length}</span>}
            </button>
          ))}
        </div>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} uid={uid} />)
      )}
      {busy ? (
        <Loading />
      ) : posts.length === 0 ? (
        <Empty
          title={
            authorId
              ? "Belum ada foto"
              : variant === "saved"
                ? "Belum ada postingan tersimpan"
                : variant === "archived"
                  ? "Belum ada postingan diarsipkan"
                  : variant === "explore"
                  ? "Belum ada cerita untuk dijelajahi"
                  : "Ceritamu dimulai di sini"
          }
        >
          <p>
            {authorId
              ? "Foto yang dibagikan akan tampil di sini."
              : variant === "saved"
                ? "Tekan ikon simpan pada postingan agar mudah ditemukan lagi."
                : variant === "archived"
                  ? "Postingan yang kamu arsipkan akan muncul di sini, tersembunyi dari orang lain."
                  : variant === "explore"
                  ? "Postingan terbaru dari komunitas akan tampil di sini."
                  : "Ikuti pengguna lewat pencarian atau bagikan foto pertamamu."}
          </p>
          {variant !== "saved" && variant !== "archived" && (
            <button className="primary" onClick={() => go("/create")}>
              Bagikan foto
            </button>
          )}
        </Empty>
      ) : more ? (
        <div className="feed-sentinel" ref={sentinel}>
          <button
            className="wide load-more"
            onClick={() => void load(posts.at(-1)?.id)}
          >
            Muat postingan berikutnya
          </button>
        </div>
      ) : (
        <p className="end-feed">Kamu sudah melihat semuanya.</p>
      )}
    </div>
  );
}
export function SinglePost({ id, uid }: { id: number; uid: string }) {
  const q = useLoad(() => api.post(id), [id, uid]);
  return (
    <div className="feed-column">
      <h1>Postingan</h1>
      {q.busy ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox message={q.error} retry={q.reload} />
      ) : (
        q.value && <PostCard key={id} post={q.value} uid={uid} />
      )}
    </div>
  );
}
