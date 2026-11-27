import React, { useEffect, useState } from "react";
import { ArrowUpRight, Eye, EyeOff, LogIn, LogOut, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { isTuntasAdminUser, TUNTAS_ADMIN_EMAIL } from "../lib/adminAccess";

export default function AuthPanel({ user, passwordRecoveryActive = false, onPasswordRecoveryComplete }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("register");
  const [copyMode, setCopyMode] = useState("register");
  const [transitionPhase, setTransitionPhase] = useState("idle");
  const [pendingMode, setPendingMode] = useState(null);
  const isSliding = transitionPhase !== "idle";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFlow, setPasswordFlow] = useState("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!passwordRecoveryActive) return;
    setOpen(true);
    setMode("login");
    setCopyMode("login");
    setPasswordFlow("update");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("Tautan pemulihan terverifikasi. Buat kata sandi baru untuk akunmu.");
  }, [passwordRecoveryActive]);

  useEffect(() => {
    if (!open || busy || isSliding || mode !== "register" || passwordFlow !== "none") return;
    if (email.trim().toLowerCase() === TUNTAS_ADMIN_EMAIL) {
      changeMode("login");
    }
  }, [email, open, busy, isSliding, mode, passwordFlow]);


  function changeMode(nextMode) {
    if (busy || isSliding || mode === nextMode) return;

    setError("");
    setMessage("");
    setPasswordFlow("none");
    setConfirmPassword("");

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setMode(nextMode);
      setCopyMode(nextMode);
      setPendingMode(null);
      setTransitionPhase("idle");
      return;
    }

    // The curtain first travels to the exact center. Only its transitionend
    // event is allowed to swap the form; the second half then reveals it.
    setPendingMode(nextMode);
    setTransitionPhase("to-midpoint");
  }

  function handleCurtainTransitionEnd(event) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;

    if (transitionPhase === "to-midpoint" && pendingMode) {
      setMode(pendingMode);
      setCopyMode(pendingMode);
      setTransitionPhase("from-midpoint");
      return;
    }

    if (transitionPhase === "from-midpoint") {
      setPendingMode(null);
      setTransitionPhase("idle");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Periksa konfigurasi aplikasi.");
      return;
    }
    if (mode === "register" && !username.trim()) {
      setError("Masukkan nama pengguna terlebih dahulu.");
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
            data: {
              username: username.trim(),
              full_name: username.trim(),
            },
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

  async function requestPasswordReset(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Periksa konfigurasi aplikasi.");
      return;
    }
    if (!email.trim()) {
      setError("Masukkan alamat email akunmu terlebih dahulu.");
      return;
    }

    setBusy(true);
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (resetError) throw resetError;
      setMessage("Jika akun dengan email tersebut tersedia, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam.");
    } catch (resetError) {
      console.error("Permintaan pemulihan kata sandi gagal:", resetError);
      const detail = String(resetError.message || "").toLowerCase();
      setError(detail.includes("redirect") || detail.includes("url")
        ? "Alamat pengalihan belum diizinkan di pengaturan Supabase Auth. Admin perlu menambahkan URL situs TUNTAS."
        : resetError.message || "Tautan pemulihan gagal dikirim. Coba lagi beberapa saat.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRecoveredPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Periksa konfigurasi aplikasi.");
      return;
    }
    if (password.length < 8) {
      setError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi belum cocok.");
      return;
    }

    setBusy(true);
    try {
      const { data: updatedData, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Keep the verified recovery session alive. Signing out here forced users
      // to re-enter a password immediately after a successful reset.
      setPassword("");
      setConfirmPassword("");
      setPasswordFlow("none");
      setMessage("Kata sandi berhasil diperbarui. Membuka dashboard akunmu...");
      onPasswordRecoveryComplete?.(updatedData?.user || null);
    } catch (updateError) {
      console.error("Pembaruan kata sandi gagal:", updateError);
      setError(updateError.message || "Kata sandi gagal diperbarui. Buka kembali tautan pemulihan terbaru.");
    } finally {
      setBusy(false);
    }
  }

  function openPasswordReset() {
    setPasswordFlow("request");
    setMode("login");
    setCopyMode("login");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
    setOpen(true);
  }

  function returnToLogin() {
    setPasswordFlow("none");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
    setMode("login");
    setCopyMode("login");
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (user && !passwordRecoveryActive) {
    return (
      <div className="auth-account" aria-label="Akun aktif" data-mask-reveal>
        <span className="auth-avatar"><UserRound size={16} /></span>
        <span className="auth-account-copy">
          <strong>{user.user_metadata?.username || user.user_metadata?.full_name || user.email}</strong>
          <small>{user.email} · {isTuntasAdminUser(user) ? "Admin TUNTAS" : "Akun relawan"}</small>
        </span>

        <button type="button" className="auth-signout" onClick={signOut}>
          <LogOut size={15} /> Keluar
        </button>
      </div>
    );
  }

  // Keep the visible content in sync with the panel that has reached its new position.
  // `mode` is the target (for the slide); `copyMode` changes at the midpoint.
  const isLogin = copyMode === "login";
  const isTargetLogin = mode === "login";
  const isCopyLogin = isLogin;
  const isPasswordResetRequest = passwordFlow === "request";
  const isPasswordResetUpdate = passwordFlow === "update";

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
          disabled={isSliding || passwordRecoveryActive}
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
            <div className={`auth-card ${isTargetLogin ? "is-login" : "is-register"} ${transitionPhase === "to-midpoint" ? "is-midpoint" : ""}`}>
              <button
                type="button"
                className={`auth-visual ${isTargetLogin ? "is-login" : "is-register"}`}
                aria-label={passwordFlow === "none"
                  ? (isCopyLogin ? "Geser panel merah untuk daftar" : "Geser panel merah untuk masuk")
                  : "Panel pemulihan kata sandi"}
                onClick={() => changeMode(isLogin ? "register" : "login")}
                disabled={busy || isSliding || passwordFlow !== "none"}
                onTransitionEnd={handleCurtainTransitionEnd}
              >
                <div className="auth-visual-copy">
                  <p>
                    {isPasswordResetRequest
                      ? "ACCOUNT RECOVERY"
                      : isPasswordResetUpdate
                        ? "SECURE YOUR ACCOUNT"
                        : isCopyLogin
                          ? "READY TO MAKE A DIFFERENCE?"
                          : "YOUR COMMUNITY IS WAITING"}
                  </p>
                  <h3>
                    {isPasswordResetRequest
                      ? "Forgot Password?"
                      : isPasswordResetUpdate
                        ? "Welcome Back!"
                        : isCopyLogin
                          ? "Hello, Friend!"
                          : "Welcome Back!"}
                  </h3>
                  <span>
                    {isPasswordResetRequest
                      ? "Kami akan membantu mengirim tautan untuk memulihkan akunmu."
                      : isPasswordResetUpdate
                        ? "Atur kata sandi baru agar akunmu kembali aman."
                        : isCopyLogin
                          ? "Bergabunglah dan mulai perjalanan membuat perubahan bersama."
                          : "Kami senang melihatmu kembali. Masuk untuk melanjutkan aksi baikmu bersama TUNTAS."}
                  </span>
                </div>
                {passwordFlow === "none" && <span className="auth-mode-cta">{isCopyLogin ? "Sign Up" : "Sign In"}</span>}
              </button>

              <div className={`auth-form-side ${isTargetLogin ? "is-login" : "is-register"}`}>
                <div className="auth-form-heading">
                  <span>
                    {isPasswordResetRequest ? "ACCOUNT RECOVERY" : isPasswordResetUpdate ? "SECURE YOUR ACCOUNT" : isCopyLogin ? "WELCOME BACK" : "GET STARTED"}
                  </span>
                  <h3>
                    {isPasswordResetRequest ? "Lupa Kata Sandi?" : isPasswordResetUpdate ? "Buat Kata Sandi Baru" : isCopyLogin ? "Welcome Back" : "Create Account"}
                  </h3>
                  <p>
                    {isPasswordResetRequest
                      ? "Masukkan email akunmu. Kami akan mengirim tautan pemulihan jika akun tersedia."
                      : isPasswordResetUpdate
                        ? "Pilih kata sandi baru minimal 8 karakter untuk mengamankan akun TUNTAS."
                        : isCopyLogin
                          ? "Masuk untuk melanjutkan kontribusimu."
                          : "Buat akun relawan dan mulai ambil bagian."}
                  </p>
                </div>

                <form
                  className="auth-form"
                  onSubmit={isPasswordResetRequest ? requestPasswordReset : isPasswordResetUpdate ? updateRecoveredPassword : submit}
                >
                  {!isLogin && !isPasswordResetRequest && !isPasswordResetUpdate && (
                    <>
                      <label htmlFor="auth-username">Nama pengguna</label>
                      <input
                        id="auth-username"
                        type="text"
                        autoComplete="nickname"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Nama yang ingin ditampilkan"
                        maxLength={40}
                        disabled={busy || isSliding}
                        required
                      />
                    </>
                  )}

                  {!isPasswordResetUpdate && (
                    <>
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
                    </>
                  )}

                  {!isPasswordResetRequest && (
                    <>
                      <label htmlFor="auth-password">{isPasswordResetUpdate ? "Kata sandi baru" : "Kata sandi"}</label>
                      <div className="auth-password-field">
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={isPasswordResetUpdate || !isLogin ? "new-password" : "current-password"}
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
                    </>
                  )}

                  {isPasswordResetUpdate && (
                    <>
                      <label htmlFor="auth-confirm-password">Ulangi kata sandi baru</label>
                      <div className="auth-password-field">
                        <input
                          id="auth-confirm-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          minLength={8}
                          placeholder="Ketik ulang kata sandi"
                          disabled={busy || isSliding}
                          required
                        />
                      </div>
                    </>
                  )}

                  {isLogin && passwordFlow === "none" && (
                    <button type="button" className="auth-recovery-link" onClick={openPasswordReset} disabled={busy || isSliding}>
                      Lupa kata sandi?
                    </button>
                  )}

                  {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
                  {message && <p className="auth-feedback auth-success" role="status">{message}</p>}

                  <button className="auth-submit" disabled={busy || isSliding}>
                    {busy
                      ? "Memproses..."
                      : isPasswordResetRequest
                        ? "Kirim tautan pemulihan"
                        : isPasswordResetUpdate
                          ? "Simpan kata sandi baru"
                          : isCopyLogin
                            ? "Masuk ke akun"
                            : "Buat akun relawan"}
                    {!busy && <ArrowUpRight size={16} />}
                  </button>

                  {passwordFlow !== "none" && (
                    <button type="button" className="auth-recovery-back" onClick={returnToLogin} disabled={busy}>
                      Kembali ke login
                    </button>
                  )}

                  <small className="auth-footnote">
                    {isPasswordResetRequest
                      ? "Periksa kotak masuk dan folder spam setelah meminta tautan."
                      : isPasswordResetUpdate
                        ? "Gunakan kata sandi unik yang tidak dipakai di situs lain."
                        : "Gunakan email aktif. Konfirmasi email mungkin diperlukan sebelum masuk."}
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
