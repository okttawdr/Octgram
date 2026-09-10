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
import { User, ErrorBox, Loading, Empty, RichText } from "./ui";
type Comment = {
  id: number;
  body: string;
  parent_id: number | null;
  created_at: string;
  author: Profile;
};
export function PostCard({ post, uid }: { post: Post; uid: string }) {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(post.liked);
  const [count, setCount] = useState(Number(post.like_count));
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [commentCount, setCommentCount] = useState(Number(post.comment_count));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lock = useRef(false);
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
        </div>
        <strong>{count.toLocaleString("id-ID")} suka</strong>
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
  variant?: "home" | "explore" | "saved";
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
                : variant === "explore"
                  ? "Postingan terbaru dari komunitas akan tampil di sini."
                  : "Ikuti pengguna lewat pencarian atau bagikan foto pertamamu."}
          </p>
          {variant !== "saved" && (
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
