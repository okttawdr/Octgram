import { useState } from "react";

const EMOJI_GROUPS: Array<{ label: string; items: string[] }> = [
  { label: "Sering", items: ["😂", "❤️", "👍", "🙏", "😊", "🔥", "🎉", "😍"] },
  { label: "Wajah", items: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "😭", "😡", "🥺", "🤩", "😴", "🤯", "🥳", "😇", "🙂", "🙃", "😉", "😌", "😤", "🤗"] },
  { label: "Tangan", items: ["👍", "👎", "👏", "🙏", "🤝", "✌️", "🤟", "👋", "🫶", "💪", "✊", "👌", "🤙", "🖐️", "✋", "👀"] },
  { label: "Hati", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "💖", "💘", "💝", "💕"] },
  { label: "Objek", items: ["🔥", "⭐", "🎉", "🎂", "🎁", "⚽", "🏀", "🎮", "📸", "🎵", "☕", "🍜", "🌹", "🌙", "☀️", "🌈", "💡", "🎯", "🚀", "✨"] },
];

const RECENT_KEY = "octgram-emoji-recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const pick = (emoji: string) => {
    const next = [emoji, ...recent.filter((r) => r !== emoji)].slice(0, 16);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* abaikan */ }
    onPick(emoji);
  };
  const visibleGroups = q
    ? [{ label: "Hasil", items: EMOJI_GROUPS.flatMap((g) => g.items).filter((e, i, a) => a.indexOf(e) === i) }]
    : [{ label: "Terakhir", items: recent }, ...EMOJI_GROUPS.slice(tab, tab + 1)];
  return (
    <div className="emoji-pop" role="dialog" aria-label="Pilih emoticon">
      <div className="emoji-head">
        <input aria-label="Cari emoticon" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="bare" onClick={onClose} aria-label="Tutup emoticon">
          ✕
        </button>
      </div>
      {!q && (
        <div className="emoji-tabs">
          {EMOJI_GROUPS.map((g, i) => (
            <button key={g.label} className={i === tab ? "active" : ""} onClick={() => setTab(i)}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-grid">
        {visibleGroups.map((g) =>
          g.items.length ? (
            g.items.map((e) => (
              <button key={g.label + e} className="emoji-btn" onClick={() => pick(e)} aria-label={`Emoji ${e}`}>
                {e}
              </button>
            ))
          ) : (
            <p key={g.label} className="muted">
              Belum ada emoticon.
            </p>
          ),
        )}
      </div>
    </div>
  );
}

export const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];
