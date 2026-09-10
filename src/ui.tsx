import { useState } from "react";
import type { ReactNode } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { photo, go, type Profile, errorText } from "./lib";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
          <path
            d="M16 2c7.7 0 14 6.3 14 14s-6.3 14-14 14S2 23.7 2 16 8.3 2 16 2Z"
            stroke="currentColor"
            strokeWidth="2.6"
          />
          <path d="M16 2v11.2L24.9 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </span>
      Octgram<span className="brand-dot">.</span>
    </span>
  );
}
export function Avatar({ p, size = 40 }: { p: Profile; size?: number }) {
  return p.avatar_path ? (
    <img
      className="avatar"
      width={size}
      height={size}
      src={photo(p.avatar_path)}
      alt=""
      loading="lazy"
    />
  ) : (
    <span
      className="avatar initials"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {(p.display_name || p.username).slice(0, 1).toUpperCase()}
    </span>
  );
}
export function User({ p }: { p: Profile }) {
  return (
    <button className="user bare" onClick={() => go("/profile/" + p.username)}>
      <Avatar p={p} />
      <span>
        <strong>{p.display_name || p.username}</strong>
        <small>@{p.username}</small>
      </span>
    </button>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Camera size={28} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} /> Memuat…
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      {message}
      {retry && <button onClick={retry}>Coba lagi</button>}
    </div>
  );
}
export function Action({
  run,
  children,
  className = "",
  disabled = false,
}: {
  run: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button
        disabled={busy || disabled}
        className={className}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await run();
          } catch (e) {
            setErr(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle className="spin" size={18} /> : children}
      </button>
      {err && <ErrorBox message={err} />}
    </>
  );
}
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[a-zA-Z0-9_]{3,24})/g).map((part, i) =>
        part.startsWith("@") ? (
          <button
            key={i}
            className="mention bare"
            onClick={() => go("/profile/" + part.slice(1).toLowerCase())}
          >
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
