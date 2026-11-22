import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Eye, EyeOff, LogIn, LogOut, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { isTuntasAdminUser, TUNTAS_ADMIN_EMAIL } from "../lib/adminAccess";

const AUTH_SLIDE_DURATION_MS = 820;

export default function AuthPanel({ user }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("register");
  const [copyMode, setCopyMode] = useState("register");
  const [isSliding, setIsSliding] = useState(false);
  const transitionTimer = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }
  }, []);
  useEffect(() => {
    if (!open || busy || isSliding || mode !== "register") return;
    if (email.trim().toLowerCase() === TUNTAS_ADMIN_EMAIL) {
      changeMode("login");
    }
  }, [email, open, busy, isSliding, mode]);


  function changeMode(nextMode) {
    if (busy || isSliding || mode === nextMode) return;

    setError("");
    setMessage("");

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setMode(nextMode);

    if (reduceMotion) {
      setCopyMode(nextMode);
      return;
    }

    setIsSliding(true);
    transitionTimer.current = window.setTimeout(() => {
      setCopyMode(nextMode);
      transitionTimer.current = window.setTimeout(() => {
        setIsSliding(false);
        transitionTimer.current = null;
      }, AUTH_SLIDE_DURATION_MS / 2);
    }, AUTH_SLIDE_DURATION_MS / 2);
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
      const authCode = authError.code || authError.error || "";
      const authMessage = String(authError.message || "").toLowerCase();
      if (authCode === "invalid_credentials" || authMessage.includes("invalid login credentials")) {
        setError("Email atau kata sandi salah. Periksa kembali, lalu coba lagi. Kamu bisa tekan ikon mata untuk melihat kata sandi.");
      } else if (authCode === "email_not_confirmed" || authMessage.includes("email not confirmed")) {
        setError("Email belum dikonfirmasi. Buka pesan konfirmasi dari Supabase di kotak masuk email.");
      } else if (authCode === "user_banned") {
        setError("Akun sedang dinonaktifkan. Hubungi admin TUNTAS.");
      } else {
        setError(authError.message || "Autentikasi gagal. Coba lagi beberapa saat.");
      }
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
          <small>{isTuntasAdminUser(user) ? "Admin TUNTAS" : "Akun relawan"}</small>
        </span>

        <button type="button" className="auth-signout" onClick={signOut}>
          <LogOut size={15} /> Keluar
        </button>
      </div>
    );
  }

  const isLogin = mode === "login";
  const isCopyLogin = copyMode === "login";

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
          disabled={isSliding}
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
            <div className={`auth-card ${isLogin ? "is-login" : "is-register"}`}>
              <button
                type="button"
                className={`auth-visual ${isLogin ? "is-login" : "is-register"}`}
                aria-label={isCopyLogin ? "Geser panel merah untuk daftar" : "Geser panel merah untuk masuk"}
                onClick={() => changeMode(isLogin ? "register" : "login")}
                disabled={busy || isSliding}
              >
                <div className="auth-visual-copy">
                  <p>{isCopyLogin ? "READY TO MAKE A DIFFERENCE?" : "YOUR COMMUNITY IS WAITING"}</p>
                  <h3>{isCopyLogin ? "Hello, Friend!" : "Welcome Back!"}</h3>
                  <span>
                    {isCopyLogin
                      ? "Bergabunglah dan mulai perjalanan membuat perubahan bersama."
                      : "Kami senang melihatmu kembali. Masuk untuk melanjutkan aksi baikmu bersama TUNTAS."}
                  </span>
                </div>
                <span className="auth-mode-cta">{isCopyLogin ? "Sign Up" : "Sign In"}</span>
              </button>

              <div className={`auth-form-side ${isLogin ? "is-login" : "is-register"}`}>
                <div className="auth-form-heading">
                  <span>{isCopyLogin ? "WELCOME BACK" : "GET STARTED"}</span>
                  <h3>{isCopyLogin ? "Welcome Back" : "Create Account"}</h3>
                  <p>{isCopyLogin ? "Masuk untuk melanjutkan kontribusimu." : "Buat akun relawan dan mulai ambil bagian."}</p>
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
                    disabled={busy || isSliding}
                    required
                  />

                  <label htmlFor="auth-password">Kata sandi</label>
                  <div className="auth-password-field">
                    <input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      placeholder="Minimal 8 karakter"
                      disabled={busy || isSliding}
                      required
                    />
                    <button
                      type="button"
                      className="auth-password-visibility"
                      aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={busy || isSliding}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>

                  {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
                  {message && <p className="auth-feedback auth-success" role="status">{message}</p>}

                  <button className="auth-submit" disabled={busy || isSliding}>
                    {busy ? "Memproses..." : isCopyLogin ? "Masuk ke akun" : "Buat akun relawan"}
                    {!busy && <ArrowUpRight size={16} />}
                  </button>
                  <small className="auth-footnote">
                    Gunakan email aktif. Konfirmasi email mungkin diperlukan sebelum masuk.
                  </small>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
