import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Check,
  Users,
  UserRound,
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
    <div className="modal-backdrop" role="dialog" aria-modal aria-label="Siapa yang suka" onClick={onClose}>
      <div className="modal-card like-modal" onClick={(e) => e.stopPropagation()}>
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
  const lock = useRef(false);
  const isOwner = post.user_id === uid;
  const media = post.media[index];
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption || "");
  const [thumbDraft, setThumbDraft] = useState(post.thumbnail_index || 0);
  const [shareCopied, setShareCopied] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [showCollabs, setShowCollabs] = useState(false);
  const [showReposters, setShowReposters] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [reposted, setReposted] = useState(Boolean(post.reposted));
  const [repostCount, setRepostCount] = useState(Number(post.repost_count || 0));
  const repostLock = useRef(false);

  useEffect(() => {
    setLiked(post.liked);
    setCount(Number(post.like_count));
    setBookmarked(post.bookmarked);
    setCommentCount(Number(post.comment_count));
    setReposted(Boolean(post.reposted));
    setRepostCount(Number(post.repost_count || 0));
    setCaptionDraft(post.caption || "");
    setThumbDraft(post.thumbnail_index || 0);
  }, [post]);

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
  async function toggleRepost() {
    if (repostLock.current) return;
    repostLock.current = true;
    const next = !reposted;
    setReposted(next);
    setRepostCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      await api.setRepost(post.id, next);
    } catch (e) {
      setReposted(!next);
      setRepostCount((n) => Math.max(0, n + (next ? -1 : 1)));
      setErr(errorText(e));
    } finally {
      repostLock.current = false;
    }
  }
  async function openLikes() {
    setShowLikes(true);
    setMenuOpen(false);
  }
  async function openCollabs() {
    setShowCollabs(true);
    setMenuOpen(false);
  }
  function openReposters() {
    setShowReposters(true);
  }
  async function doEdit() {
    setActionErr("");
    try {
      await api.editPost(post.id, { caption: captionDraft, thumbnailIndex: thumbDraft });
      setEditOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
    }
  }
  async function doArchive() {
    setActionErr("");
    try {
      await api.archivePost(post.id, !post.archived);
      setMenuOpen(false);
      onAction?.("reload", post.id);
    } catch (e) {
      setActionErr(errorText(e));
      setErr(errorText(e));
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
      setErr(errorText(e));
    }
  }
  async function doShare() {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `Postingan @${post.author.username}`, text: post.caption || "Lihat postingan ini di Octgram", url });
      else await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setErr("Tautan belum dapat dibagikan. Coba lagi.");
    }
    setMenuOpen(false);
  }

  return (
    <article className="post">
      <header className="post-head">
        <User p={post.author} />
        <div className="action-menu-wrap">
          <button
            className={`bare action-menu-trigger ${menuOpen ? "active" : ""}`}
            aria-label="Opsi postingan"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && createPortal(
            <div className="post-options-layer" role="presentation" onClick={() => setMenuOpen(false)}>
              <div className="post-options-sheet" role="menu" aria-label="Opsi postingan" onClick={(e) => e.stopPropagation()}>
                <div className="post-options-handle" />
                <div className="post-options-title">
                  <Avatar p={post.author} size={38} />
                  <span><strong>Postingan @{post.author.username}</strong><small>{isOwner ? "Kelola postinganmu" : "Opsi postingan"}</small></span>
                  <button className="bare" onClick={() => setMenuOpen(false)} aria-label="Tutup"><X size={19} /></button>
                </div>
                {isOwner && (
                  <button className="action-menu-item" role="menuitem" onClick={() => { setEditOpen(true); setMenuOpen(false); }}>
                    <Pencil size={16} /> Edit postingan
                  </button>
                )}
                {!isOwner && (
                  <button className="action-menu-item" role="menuitem" onClick={() => go(`/profile/${post.author.username}`)}>
                    <UserRound size={16} /> Tentang akun ini
                  </button>
                )}
                <button className="action-menu-item" role="menuitem" onClick={() => { openLikes(); }}>
                  <Heart size={16} /> Siapa yang suka
                </button>
                <button className="action-menu-item" role="menuitem" onClick={() => { openCollabs(); }}>
                  <Users size={16} /> Kolaborator
                </button>
                <hr className="action-menu-divider" />
                <button className="action-menu-item" role="menuitem" onClick={() => { doShare(); }}>
                  {shareCopied ? (<><Check size={16} /> Tersalin</>) : (<><Share2 size={16} /> Bagikan</>)}
                </button>
                {isOwner && (
                  <button className="action-menu-item soft" role="menuitem" onClick={() => { doArchive(); }}>
                    <Archive size={16} /> {post.archived ? "Pulihkan dari arsip" : "Arsipkan"}
                  </button>
                )}
                {isOwner && (
                  <button className="action-menu-item danger" role="menuitem" onClick={() => { doDelete(); }}>
                    <Trash2 size={16} /> Hapus
                  </button>
                )}
              </div>
            </div>, document.body
          )}
        </div>
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
            className={"bare repost-action " + (reposted ? "reposted" : "")}
            aria-label={reposted ? "Batal repost" : "Repost"}
            aria-pressed={reposted}
            onClick={() => void toggleRepost()}
          >
            <Repeat2 size={25} />
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
        </div>
        {repostCount > 0 && (
          <button className="bare repost-bubbles" onClick={openReposters}>
            <RepostBubbles postId={post.id} count={repostCount} />
            <span>{repostCount === 1 ? "1 repost" : `${repostCount} repost`}</span>
          </button>
        )}
        <strong className="like-count">{count.toLocaleString("id-ID")} suka</strong>
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
        <time className="post-time" dateTime={post.created_at}>{date(post.created_at)}</time>
      </div>

      {editOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal aria-label="Edit postingan" onClick={() => setEditOpen(false)}>
          <div className="modal-card edit-post-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit postingan</h2>
              <button className="bare" onClick={() => setEditOpen(false)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {post.media.length > 0 && (
                <>
                  <label className="edit-section-label">
                    Sampul postingan
                    {post.media.length > 1 && <span className="text-muted"> · pilih salah satu foto</span>}
                  </label>
                  <div className="edit-thumb-grid">
                    {post.media.map((m, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`edit-thumb ${thumbDraft === i ? "selected" : ""}`}
                        onClick={() => setThumbDraft(i)}
                        aria-label={`Jadikan foto ${i + 1} sebagai sampul`}
                      >
                        <img src={mediaUrl(m.path, 160)} alt="" />
                        {thumbDraft === i && (
                          <span className="edit-thumb-check">
                            <Check size={14} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <label className="edit-section-label" htmlFor="edit-caption-field">
                Caption
              </label>
              <textarea
                id="edit-caption-field"
                className="caption-editor"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                maxLength={2200}
                rows={4}
                placeholder="Tulis caption..."
              />
              <div className="edit-caption-meta">
                <span className="text-muted">Sebut orang lain dengan @username</span>
                <span className={`char-counter ${captionDraft.length > 2000 ? "warn" : ""}`}>
                  {captionDraft.length}/2200
                </span>
              </div>
              {actionErr && <ErrorBox message={actionErr} />}
            </div>
            <div className="modal-footer">
              <button className="bare" onClick={() => setEditOpen(false)}>
                Batal
              </button>
              <button
                className="primary"
                disabled={captionDraft === post.caption && thumbDraft === (post.thumbnail_index || 0)}
                onClick={doEdit}
              >
                Simpan perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {shareCopied && (
        <div className="toast">
          <Check size={16} /> Tersalin ke clipboard
        </div>
      )}

      {showLikes && (
        <LikesModal postId={post.id} onClose={() => setShowLikes(false)} />
      )}

      {showReposters && (
        <RepostersModal postId={post.id} onClose={() => setShowReposters(false)} />
      )}

      {showCollabs && (
        <div className="modal-backdrop" role="dialog" aria-modal aria-label="Kolaborator" onClick={() => setShowCollabs(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
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
    </article>
  );
}
function RepostBubbles({ postId, count }: { postId: number; count: number }) {
  const q = useLoad(() => api.postReposters(postId), [postId]);
  const shown = (q.value || []).slice(0, 3);
  if (!shown.length) return null;
  return (
    <span className="bubble-stack">
      {shown.map((entry, i) => (
        <span key={entry.user.id} className="bubble-avatar" style={{ zIndex: shown.length - i }}>
          <Avatar p={entry.user} size={22} />
        </span>
      ))}
    </span>
  );
}
function RepostersModal({ postId, onClose }: { postId: number; onClose: () => void }) {
  const q = useLoad(() => api.postReposters(postId), [postId]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label="Direpost oleh" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Direpost oleh</h2>
          <button className="bare" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {q.busy ? (
            <Loading />
          ) : q.error ? (
            <ErrorBox message={q.error} retry={q.reload} />
          ) : !q.value?.length ? (
            <p className="text-muted">Belum ada yang me-repost.</p>
          ) : (
            <div className="like-grid">
              {q.value.map((entry) => (
                <div key={entry.user.id} className="like-user" onClick={() => go("/profile/" + entry.user.username)}>
                  <Avatar p={entry.user} size={48} />
                  <small>{entry.user.username}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
