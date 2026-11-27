import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, ArrowLeft, Camera, CheckCircle2, Clock3, CloudSun, ExternalLink, FileSearch, MapPin, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";

const ATTACHMENT_BUCKET = "citizen-report-attachments";
const EVIDENCE_BUCKET = "report-evidence-private";

function dateText(value) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu tidak valid" : new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(date);
}
function elapsed(value) {
  if (!value) return "Belum dimulai";
  const ms = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return [days ? days + " hari" : "", hours ? hours + " jam" : "", minutes + " menit"].filter(Boolean).join(" ") || "Baru saja";
}
function suggestedSteps(report) {
  const text = [report?.category, report?.description, report?.recommendation].join(" ").toLowerCase();
  if (/sampah|limbah|bersih/.test(text)) return ["Pastikan area aman dan tidak ada benda berbahaya", "Dokumentasikan kondisi awal", "Koordinasikan dengan petugas kebersihan atau pengelola setempat", "Lakukan penanganan yang aman dan sesuai kewenangan", "Unggah foto kondisi setelah penanganan"];
  if (/jalan|lubang|aspal|trotoar/.test(text)) return ["Amati lokasi dari tempat yang aman", "Dokumentasikan kondisi dan perkiraan area terdampak", "Laporkan kebutuhan perbaikan kepada instansi berwenang", "Pasang peringatan hanya jika aman dan diizinkan", "Unggah perkembangan atau hasil tindak lanjut"];
  if (/banjir|drainase|selokan|genangan/.test(text)) return ["Periksa kondisi dari jarak aman; jangan memasuki arus atau saluran", "Dokumentasikan titik genangan dan kondisi sekitar", "Teruskan informasi kepada petugas wilayah terkait", "Pantau perubahan kondisi tanpa mengambil risiko", "Unggah bukti tindak lanjut"];
  if (/lampu|penerangan|listrik|kabel/.test(text)) return ["Jaga jarak dari instalasi listrik yang bermasalah", "Dokumentasikan lokasi dari tempat aman", "Laporkan kepada petugas teknis atau instansi terkait", "Jangan membongkar atau memperbaiki instalasi sendiri", "Unggah perkembangan penanganan"];
  return ["Baca seluruh keluhan warga dan cek lokasi dari tempat aman", "Dokumentasikan kondisi awal", "Koordinasikan tindak lanjut dengan pihak yang berwenang", "Catat perkembangan penanganan", "Unggah bukti jika ada perkembangan"];
}

export default function TaskDashboard({ report, assignment, onClose }) {
  const [complaints, setComplaints] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [volunteer, setVolunteer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    document.body.classList.add("task-dashboard-open");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("task-dashboard-open");
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const [complaintResult, profileResult, evidenceResult] = await Promise.all([
          supabase.from("report_complaints").select("id, report_id, description, location, category, priority, summary, recommendation, created_at, is_initial").eq("report_id", report.id).order("created_at", { ascending: true }),
          assignment?.volunteer_id ? supabase.from("volunteer_profiles").select("user_id, full_name, phone, area, skills, bio").eq("user_id", assignment.volunteer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
          assignment?.id ? supabase.from("report_evidence").select("id, storage_path, note, created_at").eq("assignment_id", assignment.id).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null })
        ]);
        if (complaintResult.error) throw complaintResult.error;
        if (profileResult.error) throw profileResult.error;
        if (evidenceResult.error) throw evidenceResult.error;
        const rows = complaintResult.data || [];
        const ids = rows.map((item) => item.id);
        let attachmentRows = [];
        if (ids.length) {
          const result = await supabase.from("complaint_attachments").select("id, complaint_id, file_name, content_type, size_bytes").in("complaint_id", ids).eq("status", "uploaded").order("uploaded_at", { ascending: false });
          if (result.error) throw result.error;
          attachmentRows = result.data || [];
        }
        const [citizenUrls, evidenceUrls] = await Promise.all([
          attachmentRows.length ? supabase.functions.invoke("manage-complaint-attachment", { body: { action: "view_many", attachment_ids: attachmentRows.map((item) => item.id) } }) : Promise.resolve({ data: { attachments: [] }, error: null }),
          Promise.all((evidenceResult.data || []).map(async (item) => {
            const result = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(item.storage_path, 1800);
            return { ...item, signedUrl: result.error ? null : result.data?.signedUrl || null };
          }))
        ]);
        if (citizenUrls.error) throw citizenUrls.error;
        const urlMap = new Map((citizenUrls.data?.attachments || []).map((item) => [item.id, item.signed_url]));
        if (!active) return;
        setComplaints(rows);
        setAttachments(attachmentRows.map((item) => ({ ...item, signedUrl: urlMap.get(item.id) || null })));
        setEvidence(evidenceUrls);
        setVolunteer(profileResult.data || null);
      } catch (err) {
        if (active) setError(err.message || "Detail tugas gagal dimuat.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [report.id, assignment?.id, assignment?.volunteer_id]);

  const steps = useMemo(() => suggestedSteps(report), [report]);
  const claimedAt = assignment?.claimed_at || null;
  const reportAge = elapsed(report.created_at);
  const claimedDuration = claimedAt ? elapsed(claimedAt) : "Belum diambil";
  const assignmentStatus = assignment?.status || "available";
  const statusText = ({ available: "Belum diambil", claimed: "Sedang dikerjakan", proof_submitted: "Menunggu verifikasi", verified: "Selesai diverifikasi", rejected: "Perlu perbaikan", cancelled: "Dilepas relawan" })[assignmentStatus] || assignmentStatus;

  return createPortal(
    <div className="task-dashboard-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-dashboard" role="dialog" aria-modal="true" aria-labelledby="task-dashboard-title">
        <div className="task-dashboard-layout">
          <aside className="task-dashboard-sidebar">
            <div className="task-dashboard-brand"><span className="task-dashboard-brand-mark">T</span><div><b>TUNTAS</b><small>Volunteer workspace</small></div></div>
            <span className="task-sidebar-label">TASK SPACE</span>
            {[
              ["Ringkasan", "task-overview"], ["Keluhan warga", "task-complaints"], ["Foto warga", "task-photos"],
              ["Analisis AI", "task-analysis"], ["Relawan", "task-volunteer"], ["Tahapan", "task-stages"], ["Progres", "task-progress"]
            ].map(([label, target]) => <button type="button" key={target} onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}><span className="task-sidebar-dot"/>{label}</button>)}
            <div className="task-sidebar-bottom"><span className="task-sidebar-live"/> DATA TUGAS AKTIF</div>
          </aside>
          <main className="task-dashboard-scroll">
          <header className="task-dashboard-header">
            <div><span className="task-dashboard-kicker"><Activity size={14}/> TUNTAS · VOLUNTEER WORKSPACE</span><h2 id="task-dashboard-title">Detail tugas</h2><p>{report.category || "Laporan warga"} <span>·</span> {report.location || "Lokasi belum tersedia"}</p></div>
            <button type="button" className="task-dashboard-close" onClick={onClose} aria-label="Tutup dashboard"><X size={20}/></button>
          </header>
          {loading ? <div className="task-dashboard-loading">Mengumpulkan keluhan, foto, dan data tugas...</div> : null}
          {error && <p className="task-dashboard-error" role="alert">{error}</p>}
          <div id="task-overview" className="task-dashboard-metrics">
            <article><span>Umur laporan</span><strong>{reportAge}</strong><small>Dibuat {dateText(report.created_at)}</small></article>
            <article><span>Durasi diambil relawan</span><strong>{claimedDuration}</strong><small>{claimedAt ? "Diambil " + dateText(claimedAt) : "Belum ada relawan mengambil"}</small></article>
            <article><span>Progres tugas</span><strong>{statusText}</strong><small>{assignment?.submitted_at ? "Bukti dikirim " + dateText(assignment.submitted_at) : "Belum ada bukti progres dikirim"}</small></article>
          </div>
          <section id="task-complaints" className="task-dashboard-section">
            <h3><FileSearch size={17}/> Semua keluhan warga <span>{complaints.length || (loading ? "…" : 1)}</span></h3>
            {complaints.length ? complaints.map((item) => <article className="task-complaint" key={item.id}><div><b>{item.is_initial ? "Keluhan awal" : "Keluhan tambahan"}</b><small>{dateText(item.created_at)}</small></div><p>{item.description}</p>{item.location && <small><MapPin size={12}/> {item.location}</small>}</article>) : !loading ? <article className="task-complaint"><p>{report.description}</p><small>Data keluhan terperinci belum tersedia.</small></article> : null}
          </section>
          <section id="task-photos" className="task-dashboard-section">
            <h3><Camera size={17}/> Foto & bukti warga <span>{attachments.length}</span></h3>
            {attachments.length ? <div className="task-media-grid">{attachments.map((item) => <a key={item.id} href={item.signedUrl || undefined} target="_blank" rel="noreferrer" className="task-media-item">{item.signedUrl && item.content_type.startsWith("image/") ? <img src={item.signedUrl} alt={item.file_name}/> : <div className="task-media-file">{item.file_name}</div>}<small>{item.file_name}</small></a>)}</div> : <p className="task-dashboard-muted">{loading ? "Memuat lampiran..." : "Belum ada foto/lampiran warga."}</p>}
          </section>
          <section id="task-analysis" className="task-dashboard-section task-ai-analysis">
            <h3><Sparkles size={17}/> Analisis AI dari data laporan</h3>
            <div className="task-ai-summary"><span>Ringkasan</span><p>{report.summary || "Belum ada ringkasan AI yang tersimpan untuk laporan ini."}</p></div>
            <div className="task-ai-summary"><span>Rekomendasi</span><p>{report.recommendation || "Belum ada rekomendasi AI yang tersimpan."}</p></div>
            <div className="task-source-grid">
              <article><b>Data laporan TUNTAS</b><span><CheckCircle2 size={13}/> Tersedia</span><small>Keluhan warga, lokasi, kategori, prioritas, ringkasan, rekomendasi</small></article>
              <article><b>BMKG & data cuaca</b><span className="source-pending"><CloudSun size={13}/> Belum terhubung</span><small>Tidak menampilkan kondisi cuaca sebelum sumber resmi diintegrasikan.</small></article>
              <article><b>Laporan & bukti internet</b><span className="source-pending"><ExternalLink size={13}/> Belum terverifikasi</span><small>Belum ada sumber eksternal yang disimpan untuk laporan ini.</small></article>
            </div>
          </section>
          <section id="task-volunteer" className="task-dashboard-section">
            <h3><UserRound size={17}/> Akun relawan</h3>
            {volunteer ? <div className="task-volunteer-profile"><b>{volunteer.full_name || "Nama relawan belum diisi"}</b><span>{volunteer.phone || "Kontak tidak dicantumkan"}</span><span>{volunteer.area || "Wilayah belum dicantumkan"}</span>{volunteer.skills && <small>Keahlian: {volunteer.skills}</small>}</div> : <p className="task-dashboard-muted">{assignment ? "Profil relawan belum tersedia." : "Belum ada relawan yang mengambil tugas ini."}</p>}
          </section>
          <section id="task-stages" className="task-dashboard-section">
            <h3><Activity size={17}/> Tahap penanganan (saran AI · opsional)</h3>
            <ol className="task-ai-steps">{steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
            <p className="task-dashboard-muted">Tahapan ini hanya panduan umum. Relawan boleh menyesuaikan dan tidak wajib mengikuti langkah yang tidak sesuai kondisi atau kewenangannya.</p>
          </section>
          <section id="task-progress" className="task-dashboard-section">
            <h3><ShieldCheck size={17}/> Laporan progres relawan</h3>
            {evidence.length ? <div className="task-media-grid">{evidence.map((item) => <article className="task-media-item" key={item.id}>{item.signedUrl ? <a href={item.signedUrl} target="_blank" rel="noreferrer"><img src={item.signedUrl} alt="Bukti progres relawan"/></a> : <div className="task-media-file">Bukti tidak dapat dibuka</div>}<small>{dateText(item.created_at)}</small>{item.note && <p>{item.note}</p>}</article>)}</div> : <p className="task-dashboard-muted">Relawan belum mengirim laporan progres. Pengisian laporan dan bukti bersifat opsional.</p>}
          </section>
          </main>
          <aside className="task-dashboard-rail">
            <article className="task-rail-card task-rail-blue">
              <span className="task-rail-eyebrow">RINGKASAN TUGAS</span>
              <strong>{reportAge}</strong><small>Umur sejak laporan warga dibuat</small>
              <div className="task-rail-track"><i style={{ width: assignmentStatus === "verified" ? "100%" : assignmentStatus === "proof_submitted" ? "82%" : assignmentStatus === "claimed" ? "42%" : "8%" }}/></div>
              <div className="task-rail-status-line"><span>STATUS</span><b>{statusText}</b></div>
              <div className="task-rail-chart" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div>
            </article>
            <article className="task-rail-card task-rail-volunteer"><span className="task-rail-eyebrow">RELAWAN</span><strong>{volunteer?.full_name || (assignment ? "Profil belum tersedia" : "Belum diambil")}</strong><small>{volunteer?.area || "Wilayah relawan"}</small></article>
            <article className="task-rail-card task-rail-sources"><span className="task-rail-eyebrow">SUMBER TERHUBUNG</span><div className="task-rail-source"><i className="is-ready"/> Data laporan TUNTAS</div><div className="task-rail-source"><i/> BMKG / Cuaca</div><div className="task-rail-source"><i/> Bukti internet</div><small>Sumber yang belum terhubung tidak ditampilkan sebagai data terverifikasi.</small></article>
          </aside>
        </div>
        <footer className="task-dashboard-footer"><span><Clock3 size={14}/> Diperbarui {new Date(clock).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span><button type="button" onClick={onClose}><ArrowLeft size={15}/> Kembali ke daftar tugas</button></footer>
      </section>
    </div>,
    document.body
  );
}
