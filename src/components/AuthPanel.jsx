import React, { useState } from "react";
import {
  ArrowUpRight,
  LogIn,
  LogOut,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export default function AuthPanel({ user }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Periksa konfigurasi aplikasi.");
      return;
    }
    if (!email.trim() || password.length < 8) {
      setError("Masukkan email yang valid dan kata sandi minimal 8 karakter.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
          },
        });
        if (authError) throw authError;
        if (data.session) {
          setOpen(false);
          setPassword("");
        } else {
          setMessage("Pendaftaran diterima. Buka email untuk mengonfirmasi akun, lalu masuk kembali.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        setOpen(false);
        setPassword("");
      }
    } catch (authError) {
      setError(authError.message || "Autentikasi gagal. Periksa email dan kata sandi.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (user) {
    return (
      <div className="auth-account" aria-label="Akun aktif" data-mask-reveal>
        <span className="auth-avatar"><UserRound size={16} /></span>
        <span className="auth-account-copy">
          <strong>{user.email}</strong>
          <small>{user.app_metadata?.tuntas_role === "admin" ? "Admin TUNTAS" : "Akun relawan"}</small>
        </span>
        <button type="button" className="auth-signout" onClick={signOut}>
          <LogOut size={15} /> Keluar
        </button>
      </div>
    );
  }

  const isLogin = mode === "login";

  return (
    <section className="auth-entry" aria-label="Akses relawan" data-mask-reveal>
      <div className="auth-entry-copy">
        <span className="eyebrow">IKUT AMBIL BAGIAN</span>
        <h2>Ubah laporan menjadi aksi.</h2>
        <p>Masuk sebagai relawan untuk mengambil tugas warga dan membantu menyelesaikan masalah di sekitar.</p>
      </div>

      <div className="auth-entry-action">
        <button
          type="button"
          className={`auth-toggle ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-controls="tuntas-auth-dropdown"
          onClick={() => {
            setOpen((value) => !value);
            setError("");
            setMessage("");
          }}
        >
          {open ? <X size={17} /> : <LogIn size={17} />}
          {open ? "Tutup akses" : "Masuk / daftar relawan"}
          {!open && <ArrowUpRight size={15} className="auth-toggle-arrow" />}
        </button>

        <div
          id="tuntas-auth-dropdown"
          className={`auth-dropdown ${open ? "is-open" : ""}`}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="auth-dropdown-inner">
            <div className="auth-card">
              <aside className="auth-visual">
                <span className="auth-visual-kicker"><Sparkles size={13} /> TUNTAS COMMUNITY</span>
                <div className="auth-visual-orbit" aria-hidden="true"><span /><span /><span /></div>
                <div className="auth-visual-copy">
                  <p>{isLogin ? "SENANG MELIHATMU KEMBALI" : "MULAI DARI SATU LANGKAH"}</p>
                  <h3>{isLogin ? "Selamat datang kembali." : "Ayo bergerak bersama."}</h3>
                  <span>
                    {isLogin
                      ? "Lanjutkan langkah baikmu. Masuk untuk melihat dan menangani laporan warga."
                      : "Bergabunglah dengan komunitas yang mengubah kepedulian menjadi tindakan nyata."}
                  </span>
                </div>
                <button
                  type="button"
                  className="auth-mode-cta"
                  onClick={() => changeMode(isLogin ? "register" : "login")}
                >
                  {isLogin ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
                  <ArrowUpRight size={15} />
                </button>
              </aside>

              <div className="auth-form-side">
                <div className="auth-form-heading">
                  <span>{isLogin ? "WELCOME BACK" : "JOIN THE MOVEMENT"}</span>
                  <h3>{isLogin ? "Masuk ke TUNTAS" : "Buat akun relawan"}</h3>
                  <p>{isLogin ? "Masuk untuk melanjutkan kontribusimu." : "Isi data berikut untuk mulai berkontribusi."}</p>
                </div>

                <form className="auth-form" onSubmit={submit}>
                  <label htmlFor="auth-email">Alamat email</label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nama@email.com"
                    required
                  />

                  <label htmlFor="auth-password">Kata sandi</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    placeholder="Minimal 8 karakter"
                    required
                  />

                  {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
                  {message && <p className="auth-feedback auth-success" role="status">{message}</p>}

                  <button className="auth-submit" disabled={busy}>
                    {busy ? "Memproses..." : isLogin ? "Masuk ke akun" : "Buat akun relawan"}
                    {!busy && <ArrowUpRight size={16} />}
                  </button>
                  <small className="auth-footnote">
                    Gunakan email aktif. Konfirmasi email mungkin diperlukan sebelum masuk.
                  </small>
                </form>

                <div className="auth-mobile-switch">
                  <button type="button" onClick={() => changeMode(isLogin ? "register" : "login")}>
                    {isLogin ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
