import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import MagneticButton from "./MagneticButton";
import { isTuntasAdminUser } from "../lib/adminAccess";
import TaskDashboard from "./TaskDashboard";

const PlushTile = React.lazy(() => import("./PlushTile"));

const EVIDENCE_BUCKET = "report-evidence-private";
const REPORT_FIELDS = "id, description, location, category, priority, summary, recommendation, status, created_at, latitude, longitude";
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function formatDate(value) {
  if (!value) return "Waktu belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak valid";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(status) {
  const labels = {
    claimed: "Sedang dikerjakan",
    proof_submitted: "Menunggu verifikasi",
    verified: "Selesai diverifikasi",
    rejected: "Perlu perbaikan",
    cancelled: "Dilepas relawan",
  };
  return labels[status] || status || "Belum ada status";
}

function AssignmentCard({ assignment, isAdmin, onCancel, onReview, onRefresh, onCheckTask }) {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const report = assignment.report;

  async function submitEvidence(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (files.length < 1 || files.length > 3) {
      setError("Pilih 1 sampai 3 foto sebagai bukti penanganan.");
      return;
    }
    if (files.some((file) => !ALLOWED_TYPES[file.type] || file.size > 5 * 1024 * 1024)) {
      setError("Gunakan JPG, PNG, atau WEBP. Ukuran setiap foto maksimal 5 MB.");
      return;
    }

    setBusy(true);
    const uploadedPaths = [];
    try {
      for (const file of files) {
        const extension = ALLOWED_TYPES[file.type];
        const uniquePart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${uploadedPaths.length}`;
        const path = `${assignment.id}/${assignment.volunteer_id}/${uniquePart}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      const { error: submitError } = await supabase.rpc("submit_report_evidence", {
        p_assignment_id: assignment.id,
        p_storage_paths: uploadedPaths,
        p_note: note.trim() || null,
      });
      if (submitError) throw submitError;

      setFiles([]);
      setNote("");
      setMessage("Bukti berhasil dikirim. Status laporan berubah menjadi menunggu verifikasi admin.");
      await onRefresh();
    } catch (submitError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths).catch(() => undefined);
      }
      setError(submitError.message || "Bukti gagal dikirim. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  async function review(approved) {
    setError("");
    setMessage("");
    if (!approved && reviewNote.trim().length < 5) {
      setError("Tulis alasan penolakan minimal 5 karakter agar relawan tahu apa yang perlu diperbaiki.");
      return;
    }
    setBusy(true);
    try {
      await onReview(assignment.id, approved, reviewNote.trim() || null);
      setMessage(approved ? "Bukti disetujui. Laporan resmi ditandai selesai." : "Bukti ditolak dan dikembalikan untuk perbaikan.");
    } catch (reviewError) {
      setError(reviewError.message || "Keputusan verifikasi gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="assignment-card">
      <div className="assignment-topline">
        <span className={`assignment-status status-${assignment.status}`}>{statusLabel(assignment.status)}</span>
        <small>{formatDate(assignment.claimed_at || assignment.created_at)}</small>
      </div>
      <button type="button" className="task-check-button" onClick={() => onCheckTask?.(report, assignment)}><ClipboardList size={15} /> Cek tugas</button>
      <div className="assignment-heading">
        <div>
          <span className="assignment-category">{report?.category || "Laporan warga"}</span>
          <h4>{report?.description || "Rincian laporan tidak tersedia"}</h4>
        </div>
        <span className="assignment-priority">{report?.priority || "Prioritas belum ditentukan"}</span>
      </div>
      {report?.location && <p className="assignment-location">{report.location}</p>}

      {assignment.citizenAttachments?.length > 0 && (
        <div className="citizen-evidence-on-task">
          <strong><Camera size={14} /> Bukti dari warga ({assignment.citizenAttachments.length})</strong>
          <div className="citizen-evidence-task-grid">
            {assignment.citizenAttachments.map((item) => (
              <div className="citizen-evidence-task-item" key={item.id}>
                {item.signedUrl && item.content_type.startsWith("image/") ? (
                  <a href={item.signedUrl} target="_blank" rel="noreferrer">
                    <img src={item.signedUrl} alt={"Lampiran warga " + item.file_name} loading="lazy" />
                  </a>
                ) : item.signedUrl && item.content_type.startsWith("video/") ? (
                  <video controls preload="metadata">
                    <source src={item.signedUrl} type={item.content_type} />
                  </video>
                ) : item.signedUrl && item.content_type.startsWith("audio/") ? (
                  <audio controls preload="none" src={item.signedUrl} />
                ) : (
                  <a href={item.signedUrl || undefined} target="_blank" rel="noreferrer" className="citizen-evidence-task-file">
                    <ClipboardList size={18} />
                    <span>{item.file_name}</span>
                  </a>
                )}
                <small>{item.file_name}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="assignment-volunteer">
          <UserRound size={15} />
          <span>
            <strong>{assignment.volunteer?.full_name || "Nama relawan belum tersedia"}</strong>
            {assignment.volunteer?.phone ? ` · ${assignment.volunteer.phone}` : ""}
          </span>
        </div>
      )}

      {assignment.evidence?.length > 0 && (
        <div className="evidence-preview">
          <strong>Foto bukti ({assignment.evidence.length})</strong>
          <div className="evidence-grid">
            {assignment.evidence.map((item) => (
              <a key={item.id} href={item.signedUrl || undefined} target="_blank" rel="noreferrer" className={!item.signedUrl ? "evidence-disabled" : ""}>
                {item.signedUrl ? <img src={item.signedUrl} alt="Foto bukti penanganan laporan" loading="lazy" /> : <span>Foto tidak dapat dibuka</span>}
              </a>
            ))}
          </div>
          {assignment.evidence[0]?.note && <p className="evidence-note">Catatan relawan: {assignment.evidence[0].note}</p>}
        </div>
      )}

      {!isAdmin && assignment.status === "claimed" && (
        <form className="evidence-form" onSubmit={submitEvidence}>
          <label htmlFor={`evidence-${assignment.id}`}>Foto bukti penanganan</label>
          <input
            id={`evidence-${assignment.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 3))}
          />
          <small>{files.length ? `${files.length} foto dipilih` : "Pilih 1–3 foto JPG, PNG, atau WEBP (maks. 5 MB per foto)."}</small>
          <label htmlFor={`note-${assignment.id}`}>Catatan penanganan</label>
          <textarea id={`note-${assignment.id}`} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Jelaskan tindakan yang dilakukan..." />
          <div className="assignment-actions">
            <button type="submit" className="volunteer-primary" disabled={busy}><Camera size={15} /> {busy ? "Mengirim..." : "Kirim bukti"}</button>
            <button type="button" className="volunteer-secondary" disabled={busy} onClick={() => onCancel(assignment.id)}>Lepas tugas</button>
          </div>
        </form>
      )}

      {isAdmin && assignment.status === "proof_submitted" && (
        <div className="review-form">
          <label htmlFor={`review-${assignment.id}`}>Catatan verifikasi (wajib jika ditolak)</label>
          <textarea id={`review-${assignment.id}`} rows={2} maxLength={500} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Catatan untuk relawan..." />
          <div className="assignment-actions">
            <button type="button" className="volunteer-primary" disabled={busy} onClick={() => review(true)}><BadgeCheck size={15} /> Setujui & selesaikan</button>
            <button type="button" className="volunteer-danger" disabled={busy} onClick={() => review(false)}><XCircle size={15} /> Tolak bukti</button>
          </div>
        </div>
      )}

      {assignment.status === "proof_submitted" && !isAdmin && <p className="assignment-hint"><Clock3 size={14} /> Bukti sudah diterima dan sedang menunggu pemeriksaan admin.</p>}
      {assignment.status === "verified" && <p className="assignment-hint assignment-approved"><CheckCircle2 size={14} /> Bukti disetujui. Tugas dinyatakan selesai.</p>}
      {assignment.status === "rejected" && <p className="assignment-hint assignment-rejected">Catatan admin: {assignment.review_note || "Bukti perlu diperbaiki."}</p>}
      {error && <p className="volunteer-error" role="alert">{error}</p>}
      {message && <p className="volunteer-success" role="status">{message}</p>}
    </article>
  );
}

export default function VolunteerCenter({ user, onAdminDataChanged, onProfileUpdated }) {
  const isAdmin = isTuntasAdminUser(user);
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [area, setArea] = useState("");
  const [openReports, setOpenReports] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState({ available: 0, active: 0, waiting: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [claimingReportId, setClaimingReportId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoading(true);
    setError("");
    try {
      const profileResult = await supabase
        .from("volunteer_profiles")
        .select("user_id, full_name, phone, bio, skills, area, avatar_url, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileResult.error) throw profileResult.error;
      setProfile(profileResult.data || null);
      setFullName(profileResult.data?.full_name || "");
      setPhone(profileResult.data?.phone || "");
      setBio(profileResult.data?.bio || "");
      setSkills(profileResult.data?.skills || "");
      setArea(profileResult.data?.area || "");

      const openResult = await supabase
        .from("reports")
        .select(REPORT_FIELDS)
        .in("status", ["Baru", "Perlu Perbaikan"])
        .order("created_at", { ascending: false })
        .limit(30);
      if (openResult.error) throw openResult.error;
      setOpenReports(openResult.data || []);

      let assignmentQuery = supabase
        .from("report_assignments")
        .select("id, report_id, volunteer_id, status, claimed_at, submitted_at, reviewed_at, reviewer_id, review_note, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (isAdmin) assignmentQuery = assignmentQuery.eq("status", "proof_submitted");
      else assignmentQuery = assignmentQuery.eq("volunteer_id", user.id);
      const assignmentResult = await assignmentQuery;
      if (assignmentResult.error) throw assignmentResult.error;
      const assignmentRows = assignmentResult.data || [];

      const reportIds = [...new Set(assignmentRows.map((row) => row.report_id))];
      const volunteerIds = [...new Set(assignmentRows.map((row) => row.volunteer_id))];
      const assignmentIds = assignmentRows.map((row) => row.id);
      const [assignedReportsResult, volunteersResult, evidenceResult, complaintRowsResult] = await Promise.all([
        reportIds.length
          ? supabase.from("reports").select(REPORT_FIELDS).in("id", reportIds)
          : Promise.resolve({ data: [], error: null }),
        isAdmin && volunteerIds.length
          ? supabase.from("volunteer_profiles").select("user_id, full_name, phone").in("user_id", volunteerIds)
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length
          ? supabase.from("report_evidence").select("id, assignment_id, volunteer_id, storage_path, note, created_at").in("assignment_id", assignmentIds).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        reportIds.length
          ? supabase.from("report_complaints").select("id, report_id").in("report_id", reportIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (assignedReportsResult.error) throw assignedReportsResult.error;
      if (volunteersResult.error) throw volunteersResult.error;
      if (evidenceResult.error) throw evidenceResult.error;
      if (complaintRowsResult.error) throw complaintRowsResult.error;

      const citizenComplaintRows = complaintRowsResult.data || [];
      const citizenComplaintIds = citizenComplaintRows.map((row) => row.id);
      const reportByComplaint = Object.fromEntries(citizenComplaintRows.map((row) => [row.id, row.report_id]));
      const citizenAttachmentsByReport = {};
      if (citizenComplaintIds.length) {
        const { data: citizenAttachmentRows, error: citizenAttachmentError } = await supabase
          .from("complaint_attachments")
          .select("id, complaint_id, file_name, content_type, size_bytes")
          .in("complaint_id", citizenComplaintIds)
          .eq("status", "uploaded")
          .order("uploaded_at", { ascending: false });
        if (citizenAttachmentError) throw citizenAttachmentError;

        const urlMap = new Map();
        const rows = citizenAttachmentRows || [];
        for (let start = 0; start < rows.length; start += 200) {
          const page = rows.slice(start, start + 200);
          const { data: viewData, error: viewError } = await supabase.functions.invoke(
            "manage-complaint-attachment",
            { body: { action: "view_many", attachment_ids: page.map((item) => item.id) } }
          );
          if (viewError) throw viewError;
          for (const item of viewData?.attachments || []) urlMap.set(item.id, item.signed_url);
        }

        for (const item of rows) {
          const reportId = reportByComplaint[item.complaint_id];
          if (!reportId) continue;
          if (!citizenAttachmentsByReport[reportId]) citizenAttachmentsByReport[reportId] = [];
          citizenAttachmentsByReport[reportId].push({
            ...item,
            signedUrl: urlMap.get(item.id) || null,
          });
        }
      }

      const reportMap = Object.fromEntries((assignedReportsResult.data || []).map((row) => [row.id, row]));
      const volunteerMap = Object.fromEntries((volunteersResult.data || []).map((row) => [row.user_id, row]));
      const evidenceRows = evidenceResult.data || [];
      const evidenceWithUrls = await Promise.all(evidenceRows.map(async (item) => {
        const { data, error: signedError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUrl(item.storage_path, 1800);
        return { ...item, signedUrl: signedError ? null : data?.signedUrl || null };
      }));
      const evidenceMap = {};
      for (const item of evidenceWithUrls) {
        if (!evidenceMap[item.assignment_id]) evidenceMap[item.assignment_id] = [];
        evidenceMap[item.assignment_id].push(item);
      }

      setAssignments(assignmentRows.map((row) => ({
        ...row,
        report: reportMap[row.report_id] || null,
        volunteer: volunteerMap[row.volunteer_id] || null,
        evidence: evidenceMap[row.id] || [],
        citizenAttachments: citizenAttachmentsByReport[row.report_id] || [],
      })));

      const activeQuery = supabase.from("report_assignments").select("id", { count: "exact", head: true }).in("status", ["claimed", "proof_submitted"]);
      const waitingQuery = supabase.from("report_assignments").select("id", { count: "exact", head: true }).eq("status", "proof_submitted");
      const verifiedQuery = supabase.from("report_assignments").select("id", { count: "exact", head: true }).eq("status", "verified");
      if (!isAdmin) {
        activeQuery.eq("volunteer_id", user.id);
        waitingQuery.eq("volunteer_id", user.id);
        verifiedQuery.eq("volunteer_id", user.id);
      }
      const [activeCount, waitingCount, verifiedCount] = await Promise.all([activeQuery, waitingQuery, verifiedQuery]);
      if (activeCount.error || waitingCount.error || verifiedCount.error) {
        throw activeCount.error || waitingCount.error || verifiedCount.error;
      }
      setStats({
        available: openResult.data?.length || 0,
        active: activeCount.count || 0,
        waiting: waitingCount.count || 0,
        verified: verifiedCount.count || 0,
      });
    } catch (loadError) {
      console.error("Gagal memuat ruang relawan:", loadError);
      setError(loadError.message || "Data relawan gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  // Volunteer evidence links are signed for 30 minutes. Refresh them while
  // the page is active and immediately after returning from a long background.
  useEffect(() => {
    let lastRefreshAt = Date.now();

    const refreshExpiredEvidenceLinks = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt < 20 * 60 * 1000) return;

      lastRefreshAt = Date.now();
      void loadData();
    };

    const timer = window.setInterval(refreshExpiredEvidenceLinks, 60 * 1000);
    document.addEventListener("visibilitychange", refreshExpiredEvidenceLinks);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshExpiredEvidenceLinks);
    };
  }, [loadData]);

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (fullName.trim().length < 2 || fullName.trim().length > 80) {
      setError("Nama harus terdiri dari 2–80 karakter.");
      return;
    }
    if (phone.trim().length > 30) {
      setError("Nomor kontak maksimal 30 karakter.");
      return;
    }
    setSavingProfile(true);
    try {
      const payload = {
        user_id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        skills: skills.trim() || null,
        area: area.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error: profileError } = await supabase
        .from("volunteer_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id, full_name, phone, bio, skills, area, avatar_url, created_at, updated_at")
        .single();
      if (profileError) throw profileError;
      setProfile(data);
      onProfileUpdated?.(data);
      setMessage("Profil relawan berhasil disimpan.");
      await loadData();
    } catch (profileError) {
      setError(profileError.message || "Profil gagal disimpan.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function claimReport(reportId) {
    if (claimingReportId) return;
    setError("");
    setMessage("");
    setClaimingReportId(reportId);
    try {
      const { error: claimError } = await supabase.rpc("claim_report", { p_report_id: reportId });
      if (claimError) throw claimError;
      setMessage("Tugas berhasil diambil. Silakan tangani masalah dan unggah bukti setelah selesai.");
      await loadData();
    } catch (claimError) {
      setError(claimError.message || "Tugas gagal diambil.");
    } finally {
      setClaimingReportId(null);
    }
  }

  async function cancelAssignment(assignmentId) {
    setError("");
    try {
      const { error: cancelError } = await supabase.rpc("cancel_report_assignment", { p_assignment_id: assignmentId });
      if (cancelError) throw cancelError;
      setMessage("Tugas dilepas dan kembali tersedia untuk relawan lain.");
      await loadData();
    } catch (cancelError) {
      setError(cancelError.message || "Tugas gagal dilepas.");
    }
  }

  async function reviewAssignment(assignmentId, approved, reviewNote) {
    const { error: reviewError } = await supabase.rpc("review_report_assignment", {
      p_assignment_id: assignmentId,
      p_approved: approved,
      p_review_note: reviewNote,
    });
    if (reviewError) throw reviewError;
    await loadData();
    onAdminDataChanged?.();
  }

  const myActiveAssignments = useMemo(
    () => assignments.filter((item) => ["claimed", "proof_submitted"].includes(item.status)),
    [assignments]
  );
  const profileAvatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  const profileInitial = (fullName || user?.email || "R").trim().charAt(0).toUpperCase();

  return (
    <section id="ruang-relawan" className="volunteer-center" aria-labelledby="volunteer-title" data-mask-reveal>
      <div className="volunteer-heading">
        <div>
          <span className="eyebrow">AKSI WARGA</span>
          <h2 id="volunteer-title">{isAdmin ? "Panel verifikasi" : "Ruang relawan"}</h2>
          <p>{isAdmin ? "Periksa bukti lapangan sebelum laporan dinyatakan selesai." : "Ambil tugas di sekitar, tangani masalah, lalu kirim bukti untuk diverifikasi."}</p>
        </div>
        <button type="button" className="volunteer-refresh" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin-icon" : ""} /> Segarkan
        </button>
      </div>

      <div className="volunteer-stats">
        <div><span><ClipboardList size={15} /> Tugas tersedia</span><strong>{stats.available}</strong></div>
        <div><span><Users size={15} /> Sedang dikerjakan</span><strong>{stats.active}</strong></div>
        <div><span><Clock3 size={15} /> Menunggu verifikasi</span><strong>{stats.waiting}</strong></div>
        <div><span><ShieldCheck size={15} /> Selesai terverifikasi</span><strong>{stats.verified}</strong></div>
      </div>
      <p className="volunteer-metric-note">Laporan baru hanya dihitung selesai setelah admin menyetujui bukti penanganan.</p>

      {error && <div className="volunteer-alert volunteer-alert-error" role="alert">{error}</div>}
      {message && <div className="volunteer-alert volunteer-alert-success" role="status">{message}</div>}
      {loading ? (
        <div className="volunteer-empty">Memuat data relawan...</div>
      ) : isAdmin ? (
        <div className="volunteer-panel-section">
          <div className="volunteer-subheading">
            <div><h3>Antrean bukti masuk</h3><p>Setujui hanya jika foto dan catatan cukup menunjukkan pekerjaan benar-benar dilakukan.</p></div>
            <span>{assignments.length} antrean</span>
          </div>
          {assignments.length === 0 ? (
            <div className="volunteer-empty"><CheckCircle2 size={20} /> Belum ada bukti yang menunggu verifikasi.</div>
          ) : (
            <div className="assignment-list">
              {assignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} isAdmin onReview={reviewAssignment} onRefresh={loadData} onCheckTask={(report, taskAssignment) => setSelectedTask({ report, assignment: taskAssignment })} />)}
            </div>
          )}
        </div>
      ) : profile ? (
        <div className="volunteer-content-grid">
          <div className="volunteer-panel-section">
            <div className="volunteer-subheading">
              <div><h3>Tugas tersedia</h3><p>Pilih satu laporan yang siap ditangani. Satu laporan hanya bisa diambil oleh satu relawan aktif.</p></div>
              <span>{openReports.length} laporan</span>
            </div>
            {openReports.length === 0 ? (
              <div className="volunteer-empty">Belum ada laporan yang tersedia untuk ditangani.</div>
            ) : (
              <div className="available-task-list">
                {openReports.map((report) => (
                  <article className="available-task" key={report.id}>
                    <div className="assignment-topline"><span className="assignment-category">{report.category}</span><small>{formatDate(report.created_at)}</small></div>
                    <h4>{report.description}</h4>
                    <p>{report.location}</p>
                    {report.summary && <small>{report.summary}</small>}
                    <div className="available-task-bottom">
                      <span>{report.priority || "Prioritas belum ditentukan"}</span>
                      <div className="available-task-venom">
                        <button type="button" className="task-check-button" onClick={() => setSelectedTask({ report, assignment: null })}><ClipboardList size={15} /> Cek tugas</button>
                        <MagneticButton
                          label={claimingReportId === report.id ? "MEMPROSES..." : "AMBIL TUGAS"}
                          onClick={() => claimReport(report.id)}
                          disabled={claimingReportId !== null}
                          fill="#FFFFFF"
                          textColor="#07111B"
                          sweepColor="#07111B"
                          sweepTextColor="#FFFFFF"
                          magnet={10}
                          paddingX={28}
                          paddingY={17}
                          radius={999}
                          border
                          borderOptions={{ color: "rgba(7,17,27,0.18)", width: 1 }}
                          style={{ minHeight: 58, fontWeight: 800, letterSpacing: "0.06em", fontSize: 12 }}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div id="tugas-saya" className="volunteer-panel-section">
            <div className="volunteer-subheading">
              <div><h3>Tugas saya</h3><p>Riwayat tugas yang kamu ambil dan bukti yang sudah dikirim.</p></div>
              <span>{assignments.length} tugas</span>
            </div>
            {assignments.length === 0 ? (
              <div className="volunteer-empty"><UserRound size={20} /> Kamu belum mengambil tugas.</div>
            ) : (
              <div className="assignment-list">
                {assignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} isAdmin={false} onCancel={cancelAssignment} onRefresh={loadData} onCheckTask={(report, taskAssignment) => setSelectedTask({ report, assignment: taskAssignment })} />)}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selectedTask && <TaskDashboard report={selectedTask.report} assignment={selectedTask.assignment} profile={profile} user={user} onClose={() => setSelectedTask(null)} />}

      {isAdmin && (
        <div className="admin-setup-hint">
          <ShieldCheck size={15} /> Hak admin hanya dimiliki akun pengelola TUNTAS yang telah diverifikasi oleh server.
        </div>
      )}
    </section>
  );
}
