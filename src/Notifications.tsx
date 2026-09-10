import { useEffect, useState } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { db, go, date, errorText, type Profile } from "./lib";
import { api } from "./services/api";
import { Avatar, Action, Loading, ErrorBox, Empty } from "./ui";
type Notice = {
  id: number;
  kind: string;
  post_id: number | null;
  read_at: string | null;
  created_at: string;
  actor: Profile;
};
const labels: Record<string, string> = {
  like: "menyukai fotomu.",
  comment: "menambahkan komentar atau balasan.",
  follow: "mulai mengikutimu.",
  mention: "menyebutmu dalam sebuah cerita.",
};
export default function Notifications({ uid }: { uid: string }) {
  const [rows, setRows] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  async function load(before?: number) {
    setBusy(true);
    setError("");
    try {
      const data = await api.notifications(before) as Notice[];
      setRows((old) => (before ? [...old, ...data] : data));
      setMore(data.length === 20);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    const channel = db
      .channel("notifications:" + uid)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + uid,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [uid]);
  return (
    <div className="narrow">
      <header className="page-title">
        <div>
          <p className="eyebrow">TETAP TERHUBUNG</p>
          <h1>Notifikasi</h1>
        </div>
        <button
          disabled={busy}
          aria-label="Muat ulang notifikasi"
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {rows.some((n) => !n.read_at) && (
        <Action
          className="mark-read"
          run={async () => {
            const now = new Date().toISOString();
            await api.markNotificationsRead();
            setRows((old) => old.map((n) => ({ ...n, read_at: now })));
          }}
        >
          Tandai yang ditampilkan sudah dibaca
        </Action>
      )}
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <div className="panel notices">
        {rows.map((n) => (
          <button
            key={n.id}
            className={"notice " + (!n.read_at ? "unread" : "")}
            onClick={async () => {
              try { await api.markNotificationsRead(n.id); }
              catch (cause) { setError(errorText(cause)); return; }
              go(
                n.post_id
                  ? "/post/" + n.post_id
                  : "/profile/" + n.actor.username,
              );
            }}
          >
            <Avatar p={n.actor} />
            <span>
              <b>{n.actor.username}</b> {labels[n.kind]}
              <small>{date(n.created_at)}</small>
            </span>
            {!n.read_at && <span className="unread-dot" />}
          </button>
        ))}
      </div>
      {busy ? (
        <Loading />
      ) : !rows.length ? (
        <Empty title="Belum ada kabar baru">
          <Bell />
          <p>Like, komentar, mention, dan pengikut baru akan tampil di sini.</p>
        </Empty>
      ) : (
        more && (
          <button className="wide" onClick={() => void load(rows.at(-1)?.id)}>
            Notifikasi sebelumnya
          </button>
        )
      )}
    </div>
  );
}
