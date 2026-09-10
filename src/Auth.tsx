import { useState, type FormEvent } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { authService } from "./services/auth";
import { errorText } from "./lib";
import { Brand, ErrorBox } from "./ui";

type Mode = "login" | "signup" | "reset";

export default function AuthPage({ recovery = false, onRecovered }: { recovery?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      if (recovery) {
        const { error: authError } = await authService.updatePassword(password);
        if (authError) throw authError;
        onRecovered?.();
      } else if (mode === "login") {
        const { error: authError } = await authService.signInWithPassword(email, password);
        if (authError) throw authError;
      } else if (mode === "signup") {
        const { error: authError } = await authService.signUp(email, password, fullName);
        if (authError) throw authError;
        setSuccess("Periksa email untuk tautan verifikasi. Setelah verifikasi, masuk ke Octgram.");
      } else {
        const { error: authError } = await authService.requestPasswordReset(email);
        if (authError) throw authError;
        setSuccess("Jika email terdaftar, tautan pemulihan akan dikirim. Buka tautan di browser ini.");
      }
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  const switchMode = (next: Mode) => { setMode(next); setError(""); setSuccess(""); };
  return (
    <div className="auth-page">
      <section className="auth-art">
        <Brand />
        <div className="art-center">
          <div className="octagon"><Camera size={86} strokeWidth={1.1} /></div>
          <p className="eyebrow">YOUR EVERYDAY, IN FRAME</p>
          <h1>Momen kecil.<br />Cerita yang berarti.</h1>
          <p>Satu foto, seribu cara untuk terhubung.</p>
        </div>
        <span className="art-footer">OCTGRAM / PURPLE RAINDROPS</span>
      </section>
      <section className="auth-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className="auth-content">
          <p className="eyebrow">SELAMAT DATANG DI OCTGRAM</p>
          <h1>{recovery ? "Kata sandi baru" : mode === "signup" ? "Mulai ceritamu." : mode === "reset" ? "Pulihkan akun." : "Senang melihatmu."}</h1>
          <p className="muted">{mode === "signup" ? "Buat akun untuk berbagi dan terhubung." : mode === "reset" ? "Kami akan mengirim tautan ke emailmu." : "Masuk dan lihat cerita terbaru temanmu."}</p>
          {!recovery && mode !== "reset" && <>
            <button className="google" disabled={busy} onClick={async () => {
              setError(""); setBusy(true);
              const { error: authError } = await authService.signInWithGoogle();
              if (authError) { setError(authError.message); setBusy(false); }
            }}><span className="google-g">G</span>Lanjutkan dengan Google</button>
            <div className="divider">atau dengan email</div>
          </>}
          <form onSubmit={submit}>
            {mode === "signup" && !recovery && <label>Nama tampilan<input autoComplete="name" maxLength={60} value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>}
            {!recovery && <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
            {(recovery || mode !== "reset") && <label>Kata sandi<input type="password" autoComplete={mode === "login" && !recovery ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Minimal 8 karakter" /></label>}
            {error && <ErrorBox message={error} />}
            {success && <p className="success" role="status">{success}</p>}
            <button className="primary wide" disabled={busy}>{busy ? "Mohon tunggu…" : recovery ? "Simpan kata sandi" : mode === "signup" ? "Buat akun" : mode === "reset" ? "Kirim tautan pemulihan" : "Masuk"}<ArrowRight size={18} /></button>
          </form>
          {!recovery && <div className="auth-links">
            {mode === "login" && <button className="bare" onClick={() => switchMode("reset")}>Lupa kata sandi?</button>}
            <p>{mode === "login" ? "Belum punya akun? " : ""}<button className="bare accent" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Daftar sekarang" : "Kembali ke login"}</button></p>
          </div>}
        </div>
        <small className="auth-bottom">Berbagi foto. Menjaga koneksi.</small>
      </section>
    </div>
  );
}
