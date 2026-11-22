import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,

  Bell,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  LayoutDashboard,
  MapPin,
  Moon,

  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import VolunteerCenter from "./VolunteerCenter";
import {
  PIPELINE_STAGES,
  buildChartPaths,
  buildReportSeries,
  buildVolunteerActivity,
  escapeCsvCell,
  getAdminMetrics,
  getPipelineStage,
  getPriorityLevel,
} from "../lib/adminDashboard";
import "./AdminDashboard.css";

const REPORT_SELECT = "id, description, location, category, priority, summary, recommendation, status, created_at, latitude, longitude";

const STAGE_LABELS = {
  new: "Baru",
  progress: "Dikerjakan",
  verification: "Menunggu verifikasi",
  revision: "Perlu perbaikan",
  done: "Selesai",
};

function formatDate(value, withTime = false) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak valid";
  return new Intl.DateTimeFormat("id-ID", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function greetingForHour(hour) {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function initials(value) {
  return String(value || "Admin")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "AD";
}

function assignmentStatusLabel(status) {
  const labels = {
    claimed: "Sedang dikerjakan",
    proof_submitted: "Menunggu verifikasi",
    verified: "Selesai diverifikasi",
    rejected: "Perlu perbaikan",
    cancelled: "Dilepas relawan",
  };
  return labels[status] || status || "Belum ada status";
}

function assignmentStatusTone(status) {
  if (status === "verified") return "done";
  if (status === "proof_submitted") return "verification";
  if (status === "rejected") return "revision";
  if (status === "cancelled") return "new";
  return "progress";
}

function priorityLabel(value) {
  const level = getPriorityLevel(value);
  return level === "high" ? "Tinggi" : level === "low" ? "Rendah" : "Sedang";
}

function getReportProgress(status) {
  const stage = getPipelineStage(status);
  if (stage === "done") return 4;
  if (stage === "revision") return 3;
  if (stage === "verification") return 2;
  if (stage === "progress") return 1;
  return 0;
}

function makeCsv(reports) {
  const headers = ["ID", "Deskripsi", "Lokasi", "Kategori", "Prioritas", "Status", "Tanggal"];
  const rows = reports.map((item) => [
    item.id,
    item.description,
    item.location,
    item.category,
    item.priority,
    item.status,
    item.created_at,
  ]);
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function MetricCard({ icon: Icon, label, value, note, tone, trend }) {
  const seed = tone === "gold" ? "2,19 14,15 25,17 36,9 48,13 60,6 72,11 84,4" :
    tone === "blue" ? "2,17 14,12 25,15 36,8 48,12 60,5 72,9 84,3" :
    tone === "coral" ? "2,18 14,15 25,9 36,14 48,7 60,11 72,4 84,7" :
    "2,18 14,12 25,16 36,8 48,12 60,6 72,8 84,2";
  return (
    <article className={`admin-metric admin-metric-${tone}`} data-stagger-card>
      <div className="admin-metric-heading">
        <span className="admin-metric-label"><Icon size={12} /> {label}</span>
        {trend && <span className="admin-metric-trend">{trend}</span>}
      </div>
      <div className="admin-metric-value-row">
        <strong>{value.toLocaleString("id-ID")}</strong>
        <svg className="admin-metric-sparkline" viewBox="0 0 86 22" aria-hidden="true">
          <polyline points={seed} />
        </svg>
      </div>
      <small>{note}</small>
    </article>
  );
}

function AdminRouteTimeline({ progress }) {
  const points = [{ x: 72, y: 48 }, { x: 285, y: 48 }, { x: 500, y: 48 }, { x: 715, y: 48 }, { x: 928, y: 48 }];
  const [routePosition, setRoutePosition] = useState(0);
  const steps = [
    { label: "Diterima", meta: "Laporan masuk" },
    { label: "Ditangani", meta: "Relawan bergerak" },
    { label: "Verifikasi", meta: "Bukti diperiksa" },
    { label: "Perbaikan", meta: "Tindak lanjut" },
    { label: "Selesai", meta: "Tuntas" },
  ];

  useEffect(() => {
    const target = Math.max(0, Math.min(4, progress));
    const from = routePosition;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRoutePosition(target);
      return undefined;
    }
    let frameId = 0;
    let startTime = 0;
    const duration = 1450;
    const animate = (now) => {
      if (!startTime) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setRoutePosition(from + (target - from) * eased);
      if (t < 1) frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [progress]);

  const segment = Math.min(3, Math.floor(routePosition));
  const segmentProgress = routePosition >= 4 ? 1 : routePosition - segment;
  const curveDirection = segment % 2 === 0 ? 1 : -1;
  const marker = {
    x: points[segment].x + (points[segment + 1].x - points[segment].x) * segmentProgress,
    y: 48 + curveDirection * 25 * Math.sin(Math.PI * segmentProgress),
  };
  const progressPercent = (Math.max(0, Math.min(4, progress)) / 4) * 100;
  return (
    <section className="admin-route-panel" aria-label="Perjalanan penyelesaian laporan">
      <div className="admin-route-topline">
        <span className="admin-overline">JALUR PENYELESAIAN</span>
        <span className="admin-route-live"><i /> {steps[progress]?.label || "Diterima"}</span>
      </div>
      <svg className="admin-route-svg" viewBox="0 0 1000 112" role="img" aria-label={`Progres laporan: ${steps[progress]?.label || "Diterima"}`}>
        <defs>
          <linearGradient id="admin-route-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--admin-accent)" />
            <stop offset="100%" stopColor="var(--admin-accent-bright)" />
          </linearGradient>
          <filter id="admin-route-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d="M72 48 C145 73 215 73 285 48 S430 23 500 48 S645 73 715 48 S860 23 928 48" className="admin-route-track" />
        <path d="M72 48 C145 73 215 73 285 48 S430 23 500 48 S645 73 715 48 S860 23 928 48" className="admin-route-progress" pathLength="100" style={{ strokeDashoffset: 100 - progressPercent }} />
        {points.map((point, index) => (
          <g key={steps[index].label} className={index <= progress ? "is-complete" : ""}>
            <circle cx={point.x} cy={point.y} r="11" className="admin-route-node" />
            {index < progress ? (
              <path d={`M${point.x - 4} ${point.y} l3 3 5 -6`} className="admin-route-check" />
            ) : (
              <circle cx={point.x} cy={point.y} r="3" className="admin-route-node-core" />
            )}
          </g>
        ))}
        <g className="admin-route-marker" transform={`translate(${marker.x}, ${marker.y - 28})`} filter="url(#admin-route-glow)">
          <rect x="-13" y="-13" width="26" height="26" rx="8" />
          <path d="M-5 4 L0 -6 L5 4 Z" />
          <circle cx="0" cy="1" r="1.2" />
        </g>
      </svg>
      <div className="admin-route-labels">
        {steps.map((step, index) => (
          <div key={step.label} className={index <= progress ? "is-complete" : ""}>
            <strong>{step.label}</strong><small>{step.meta}</small>
          </div>
        ))}
      </div>
      <div className="admin-route-note"><span /> {progress === 4 ? "Laporan telah dinyatakan selesai." : `Laporan sedang berada pada tahap ${steps[progress]?.label?.toLowerCase() || "diterima"}.`}</div>
    </section>
  );
}

function ReportRow({ report, complaintCount, onSelect }) {
  const priority = getPriorityLevel(report.priority);
  const stage = getPipelineStage(report.status);
  return (
    <button type="button" className="admin-report-row" onClick={() => onSelect(report)}>
      <span className={`admin-report-symbol priority-${priority}`}><FileText size={16} /></span>
      <span className="admin-report-main">
        <strong>{report.description || "Laporan warga"}</strong>
        <small><MapPin size={12} /> {report.location || "Lokasi belum dicantumkan"}</small>
      </span>
      <span className="admin-report-meta">
        <span className={`admin-pill stage-${stage}`}>{STAGE_LABELS[stage]}</span>
        <small>{complaintCount} keluhan · {formatDate(report.created_at)}</small>
      </span>
      <ChevronRight size={16} className="admin-row-arrow" />
    </button>
  );
}

function ChartPanel({ series, days, onDaysChange, total }) {
  const paths = useMemo(() => buildChartPaths(series), [series]);
  const tickIndices = series.length <= 7
    ? series.map((_, index) => index)
    : [0, Math.floor((series.length - 1) / 3), Math.floor((series.length - 1) * 2 / 3), series.length - 1];

  return (
    <section className="admin-panel admin-chart-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="admin-overline">AKTIVITAS LAPORAN</span>
          <h2>Volume laporan</h2>
          <p>Pergerakan laporan warga berdasarkan tanggal masuk.</p>
        </div>
        <div className="admin-period-switch" aria-label="Periode grafik">
          {[7, 30, 90].map((value) => (
            <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => onDaysChange(value)}>
              {value}H
            </button>
          ))}
        </div>
      </div>
      <div className="admin-chart-summary">
        <strong>{total.toLocaleString("id-ID")}</strong>
        <span>laporan dalam periode</span>
      </div>
      <div className="admin-chart-wrap">
        <svg viewBox="0 0 640 220" role="img" aria-label="Grafik jumlah laporan warga per hari">
          <defs>
            <linearGradient id="admin-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--admin-accent)" stopOpacity=".3" />
              <stop offset="100%" stopColor="var(--admin-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((tick) => {
            const y = 18 + (tick / 3) * 184;
            return <line key={tick} x1="18" x2="622" y1={y} y2={y} className="admin-chart-gridline" />;
          })}
          {paths.area && <path d={paths.area} fill="url(#admin-chart-fill)" />}
          {paths.line && <path d={paths.line} className="admin-chart-line" />}
          {paths.points.map((point, index) => (
            (days === 7 || index === paths.points.length - 1 || index === 0) && (
              <circle key={series[index].key} cx={point.x} cy={point.y} r="4" className="admin-chart-dot">
                <title>{series[index].label}: {series[index].value} laporan</title>
              </circle>
            )
          ))}
          <text x="18" y="214" className="admin-chart-axis">{Math.max(...series.map((item) => item.value), 0)} puncak</text>
          <text x="622" y="214" textAnchor="end" className="admin-chart-axis">Hari ini</text>
        </svg>
        <div className="admin-chart-labels">
          {tickIndices.map((index) => <span key={series[index].key}>{series[index].label}</span>)}
        </div>
      </div>
      <div className="admin-chart-footnote"><span /> Data diperbarui {formatDate(new Date().toISOString(), true)}</div>
    </section>
  );
}

function AttentionPanel({ items, onSelect, onOpenVerification }) {
  return (
    <section className="admin-panel admin-attention-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="admin-overline">TINDAKAN LANJUT</span>
          <h2>Perlu perhatian</h2>
          <p>Hal yang sebaiknya diperiksa lebih dulu.</p>
        </div>
        <button type="button" className="admin-text-button" onClick={onOpenVerification}>Lihat semua <ArrowUpRight size={14} /></button>
      </div>
      {items.length === 0 ? (
        <div className="admin-empty"><CheckCircle2 size={20} /><strong>Semua aman untuk saat ini.</strong><span>Tidak ada antrean mendesak.</span></div>
      ) : (
        <div className="admin-attention-list">
          {items.map((item) => {
            const isProof = item.kind === "proof";
            return (
              <button type="button" className="admin-attention-item" key={item.id} onClick={() => isProof ? onOpenVerification() : onSelect(item.report)}>
                <span className={`admin-attention-icon ${isProof ? "is-proof" : "is-report"}`}>
                  {isProof ? <ShieldCheck size={15} /> : <Clock3 size={15} />}
                </span>
                <span className="admin-attention-copy">
                  <strong>{isProof ? "Bukti menunggu verifikasi" : item.report.description || "Laporan baru"}</strong>
                  <small>{isProof ? item.volunteerName || "Relawan" : item.report.location || "Lokasi belum tersedia"}</small>
                </span>
                <span className={`admin-attention-time ${item.urgent ? "is-urgent" : ""}`}>{isProof ? "Periksa" : "Baru"}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AdminDashboard({ user, onExit }) {
  const [data, setData] = useState({ reports: [], reportCount: 0, assignments: [], volunteers: [], complaints: [], evidence: [] });
  const [activeView, setActiveView] = useState("desk");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [period, setPeriod] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState("");
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem("tuntas-admin-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const [themeTransitionKey, setThemeTransitionKey] = useState(0);

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setRefreshError("Koneksi Supabase belum tersedia. Periksa konfigurasi aplikasi.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setRefreshError("");
    try {
      const [reportsResult, assignmentsResult, volunteersResult, complaintsResult, evidenceResult] = await Promise.all([
        supabase.from("reports").select(REPORT_SELECT, { count: "exact" }).order("created_at", { ascending: false }).limit(1000),
        supabase.from("report_assignments").select("id, report_id, volunteer_id, status, claimed_at, submitted_at, reviewed_at, reviewer_id, review_note, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("volunteer_profiles").select("user_id, full_name, phone, created_at, updated_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("report_complaints").select("id, report_id, description, location, is_initial, created_at").order("created_at", { ascending: false }).limit(5000),
        supabase.from("report_evidence").select("id, assignment_id, volunteer_id, note, created_at").order("created_at", { ascending: false }).limit(5000),
      ]);

      if (reportsResult.error) throw reportsResult.error;
      const warnings = [
        assignmentsResult.error && "Data penugasan belum dapat dimuat.",
        volunteersResult.error && "Daftar relawan belum dapat dimuat.",
        complaintsResult.error && "Riwayat keluhan gabungan belum dapat dimuat.",
        evidenceResult.error && "Catatan bukti relawan belum dapat dimuat.",
      ].filter(Boolean);

      setData({
        reports: reportsResult.data || [],
        reportCount: reportsResult.count ?? (reportsResult.data || []).length,
        assignments: assignmentsResult.data || [],
        volunteers: volunteersResult.data || [],
        complaints: complaintsResult.data || [],
        evidence: evidenceResult.data || [],
      });
      setRefreshError(warnings.join(" "));
    } catch (loadError) {
      console.error("Admin dashboard load failed:", loadError);
      setRefreshError(loadError.message || "Data dashboard gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    try { window.localStorage.setItem("tuntas-admin-theme", theme); } catch { /* storage may be blocked */ }
  }, [theme]);

  const metrics = useMemo(
    () => getAdminMetrics(data.reports, data.assignments, data.volunteers, data.reportCount),
    [data.reports, data.assignments, data.volunteers, data.reportCount]
  );

  const series = useMemo(
    () => buildReportSeries(data.reports, period),
    [data.reports, period]
  );

  const chartTotal = useMemo(() => series.reduce((total, item) => total + item.value, 0), [series]);

  const volunteerById = useMemo(
    () => new Map(data.volunteers.map((item) => [item.user_id, item])),
    [data.volunteers]
  );

  const reportById = useMemo(
    () => new Map(data.reports.map((item) => [item.id, item])),
    [data.reports]
  );

  const evidenceCountByAssignment = useMemo(() => {
    const counts = new Map();
    for (const item of data.evidence) {
      counts.set(item.assignment_id, (counts.get(item.assignment_id) || 0) + 1);
    }
    return counts;
  }, [data.evidence]);

  const volunteerActivity = useMemo(
    () => buildVolunteerActivity(data.assignments),
    [data.assignments]
  );

  const complaintByReport = useMemo(() => {
    const counts = new Map();
    for (const complaint of data.complaints) {
      counts.set(complaint.report_id, (counts.get(complaint.report_id) || 0) + 1);
    }
    return counts;
  }, [data.complaints]);

  const selectedReport = useMemo(
    () => reportById.get(selectedReportId) || null,
    [reportById, selectedReportId]
  );

  const selectedVolunteer = useMemo(
    () => data.volunteers.find((item) => item.user_id === selectedVolunteerId) || null,
    [data.volunteers, selectedVolunteerId]
  );

  const selectedVolunteerAssignments = useMemo(
    () => data.assignments
      .filter((item) => item.volunteer_id === selectedVolunteerId)
      .sort((a, b) => new Date(b.claimed_at || b.created_at || 0) - new Date(a.claimed_at || a.created_at || 0)),
    [data.assignments, selectedVolunteerId]
  );

  const selectedComplaints = useMemo(
    () => data.complaints.filter((item) => item.report_id === selectedReportId),
    [data.complaints, selectedReportId]
  );

  const selectedAssignment = useMemo(
    () => data.assignments.find((item) => item.report_id === selectedReportId) || null,
    [data.assignments, selectedReportId]
  );

  const filteredReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return data.reports.filter((report) => {
      const matchesSearch = !query || [
        report.description, report.location, report.category, report.priority, report.id,
      ].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(query));
      const matchesStatus = statusFilter === "all" || getPipelineStage(report.status) === statusFilter;
      const matchesPriority = priorityFilter === "all" || getPriorityLevel(report.priority) === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [data.reports, search, statusFilter, priorityFilter]);

  const attentionItems = useMemo(() => {
    const pendingProofs = data.assignments
      .filter((item) => item.status === "proof_submitted")
      .map((item) => {
        const report = reportById.get(item.report_id);
        const volunteer = volunteerById.get(item.volunteer_id);
        return {
          id: item.id,
          kind: "proof",
          report,
          volunteerName: volunteer?.full_name || "Relawan",
          created_at: item.submitted_at || item.created_at,
          urgent: true,
        };
      });
    const highPriorityNew = data.reports
      .filter((report) => getPipelineStage(report.status) === "new" && getPriorityLevel(report.priority) === "high")
      .map((report) => ({ id: report.id, kind: "report", report, created_at: report.created_at, urgent: true }));
    const ordinaryNew = data.reports
      .filter((report) => getPipelineStage(report.status) === "new" && getPriorityLevel(report.priority) !== "high")
      .slice(0, 3)
      .map((report) => ({ id: report.id, kind: "report", report, created_at: report.created_at, urgent: false }));
    return [...pendingProofs, ...highPriorityNew, ...ordinaryNew]
      .filter((item) => item.kind === "proof" || item.report)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);
  }, [data.assignments, reportById, volunteerById]);

  const groupedReports = useMemo(() => {
    const groups = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.id, []]));
    for (const report of filteredReports) groups[getPipelineStage(report.status)].push(report);
    return groups;
  }, [filteredReports]);

  function openReport(report) {
    setSelectedReportId(report.id);
    setDetailTab("overview");
    setActiveView("detail");
  }

  function openVolunteerPortfolio(volunteer) {
    setSelectedVolunteerId(volunteer.user_id);
    setActiveView("volunteer-portfolio");
  }

  function exportReports() {
    if (!data.reports.length) return;
    const blob = new Blob(["\uFEFF", makeCsv(data.reports)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tuntas-laporan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setRefreshError(signOutError.message);
  }

  const greeting = greetingForHour(new Date().getHours());
  const pendingCount = metrics.waitingVerification;
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Admin";

  function renderDesk() {
    const dateLabel = new Intl.DateTimeFormat("id-ID", {
      weekday: "long", day: "numeric", month: "long",
    }).format(new Date());
    return (
      <>
        <div className="admin-greeting">
          <div>
            <span className="admin-overline"><span className="admin-live-dot" /> {dateLabel} · PUSAT KENDALI TUNTAS</span>
            <h1>{greeting}, {displayName}</h1>
            <p>{metrics.newReports} laporan baru menunggu ditinjau. {metrics.waitingVerification} bukti relawan perlu diperiksa sebelum masalah dinyatakan selesai.</p>
          </div>
          <div className="admin-greeting-actions">
            <button type="button" className="admin-button admin-button-quiet" onClick={() => setActiveView("pipeline")}>Pipeline <ArrowUpRight size={15} /></button>
            <button type="button" className="admin-button admin-button-primary" onClick={() => setActiveView("reports")}><span aria-hidden="true">＋</span> Laporan masuk</button>
          </div>
        </div>

        <div className="admin-metrics-grid">
          <MetricCard icon={FileText} label="Laporan masuk" value={metrics.totalReports} note="Total laporan warga tersimpan" tone="teal" trend="TOTAL" />
          <MetricCard icon={Clock3} label="Menunggu tindakan" value={metrics.newReports} note="Perlu segera ditinjau" tone="gold" />
          <MetricCard icon={Activity} label="Prioritas tinggi" value={metrics.highPriority} note="Belum dinyatakan selesai" tone="blue" />
          <MetricCard icon={Users} label="Relawan aktif" value={metrics.activeVolunteers} note={`${metrics.volunteerCount} profil terdaftar`} tone="coral" />
        </div>

        <div className="admin-main-grid">
          <ChartPanel series={series} days={period} onDaysChange={setPeriod} total={chartTotal} />
          <AttentionPanel items={attentionItems} onSelect={openReport} onOpenVerification={() => setActiveView("verification")} />
        </div>

        <section className="admin-panel admin-recent-panel">
          <div className="admin-panel-heading">
            <div><span className="admin-overline">AKTIVITAS TERKINI</span><h2>Laporan yang baru masuk</h2><p>Ikuti perkembangan laporan warga dan tindak lanjut di lapangan.</p></div>
            <button type="button" className="admin-text-button" onClick={() => setActiveView("reports")}>Lihat semua <ArrowUpRight size={14} /></button>
          </div>
          {data.reports.length === 0 ? (
            <div className="admin-empty"><FileText size={20} /><strong>Belum ada laporan.</strong><span>Laporan baru akan tampil di sini.</span></div>
          ) : (
            <div className="admin-report-list">
              {data.reports.slice(0, 6).map((report) => (
                <ReportRow key={report.id} report={report} complaintCount={complaintByReport.get(report.id) || 0} onSelect={openReport} />
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderPipeline() {
    return (
      <section className="admin-page-section">
        <div className="admin-page-heading">
          <div><span className="admin-overline">ALUR PENANGANAN</span><h1>Pipeline laporan</h1><p>Pantau pergerakan hingga 1.000 laporan terbaru dari masuk hingga selesai.</p></div>
          <span className="admin-page-count">{filteredReports.length} laporan</span>
        </div>
        <div className="admin-pipeline-board">
          {PIPELINE_STAGES.map((stage) => (
            <section className={`admin-pipeline-column tone-${stage.tone}`} key={stage.id}>
              <div className="admin-pipeline-heading">
                <span><i /> {stage.label}</span><strong>{groupedReports[stage.id].length}</strong>
              </div>
              <div className="admin-pipeline-cards">
                {groupedReports[stage.id].length === 0 ? (
                  <div className="admin-pipeline-empty">Belum ada laporan</div>
                ) : groupedReports[stage.id].map((report) => (
                  <button type="button" className="admin-pipeline-card" key={report.id} onClick={() => openReport(report)}>
                    <span className={`admin-priority-dot priority-${getPriorityLevel(report.priority)}`} />
                    <span className="admin-card-category">{report.category || "Laporan warga"}</span>
                    <strong>{report.description || "Rincian belum tersedia"}</strong>
                    <small><MapPin size={12} /> {report.location || "Lokasi belum tersedia"}</small>
                    <span className="admin-pipeline-card-foot"><span>{priorityLabel(report.priority)}</span><span>{formatDate(report.created_at)}</span></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  function renderReports() {
    return (
      <section className="admin-page-section">
        <div className="admin-page-heading">
          <div><span className="admin-overline">DATABASE PUBLIK</span><h1>Semua laporan</h1><p>Cari, saring, dan buka hingga 1.000 laporan terbaru yang dimuat.</p></div>
          <button type="button" className="admin-button admin-button-primary" onClick={exportReports}><Download size={15} /> Ekspor CSV</button>
        </div>
        <div className="admin-filter-bar">
          <label className="admin-search admin-search-wide"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari deskripsi, lokasi, kategori, atau ID..." /></label>
          <label className="admin-select-wrap"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Semua status</option>{PIPELINE_STAGES.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select><ChevronDown size={14} /></label>
          <label className="admin-select-wrap"><span>Prioritas</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Semua prioritas</option><option value="high">Tinggi</option><option value="medium">Sedang</option><option value="low">Rendah</option></select><ChevronDown size={14} /></label>
          <span className="admin-filter-count">{filteredReports.length} hasil</span>
        </div>
        <div className="admin-panel admin-table-panel">
          {filteredReports.length === 0 ? <div className="admin-empty"><Search size={20} /><strong>Tidak ada laporan yang cocok.</strong><span>Ubah kata kunci atau filter.</span></div> : (
            <div className="admin-report-list">
              {filteredReports.map((report) => <ReportRow key={report.id} report={report} complaintCount={complaintByReport.get(report.id) || 0} onSelect={openReport} />)}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderDetail() {
    if (!selectedReport) {
      return <div className="admin-panel admin-empty-page"><FileText size={22} /><strong>Pilih laporan untuk melihat rinciannya.</strong><button type="button" className="admin-button admin-button-quiet" onClick={() => setActiveView("reports")}>Kembali ke laporan</button></div>;
    }
    const stage = getPipelineStage(selectedReport.status);
    const progress = getReportProgress(selectedReport.status);
    const assignment = selectedAssignment;
    const volunteer = assignment ? volunteerById.get(assignment.volunteer_id) : null;
    const evidence = assignment ? data.evidence.filter((item) => item.assignment_id === assignment.id) : [];
    const reportComplaints = selectedComplaints.length ? selectedComplaints : [{
      id: selectedReport.id,
      description: selectedReport.description,
      location: selectedReport.location,
      is_initial: true,
      created_at: selectedReport.created_at,
    }];
    const historyItems = [
      { id: "report-created", title: "Laporan diterima", description: selectedReport.description || "Laporan warga dibuat", created_at: selectedReport.created_at },
      ...reportComplaints.filter((item) => !item.is_initial).map((item) => ({ id: `complaint-${item.id}`, title: "Keluhan tambahan digabungkan", description: item.description, created_at: item.created_at })),
      ...(assignment?.claimed_at ? [{ id: "assignment-claimed", title: "Relawan mengambil tugas", description: volunteer?.full_name || "Relawan TUNTAS", created_at: assignment.claimed_at }] : []),
      ...(assignment?.submitted_at ? [{ id: "assignment-submitted", title: "Bukti pekerjaan dikirim", description: volunteer?.full_name || "Relawan mengirim bukti", created_at: assignment.submitted_at }] : []),
      ...(assignment?.reviewed_at ? [{ id: "assignment-reviewed", title: assignment.status === "verified" ? "Bukti diverifikasi" : "Bukti perlu diperbaiki", description: assignment.review_note || "Pemeriksaan admin", created_at: assignment.reviewed_at }] : []),
      ...evidence.map((item) => ({ id: `evidence-${item.id}`, title: "Catatan bukti ditambahkan", description: item.note || "Relawan mengirim bukti lapangan", created_at: item.created_at })),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const detailTabs = [
      { id: "overview", label: "Ringkasan" },
      { id: "handling", label: "Penanganan" },
      { id: "complaints", label: "Keluhan" },
      { id: "history", label: "Riwayat" },
      { id: "evidence", label: "Bukti" },
    ];

    return (
      <section className="admin-page-section">
        <button type="button" className="admin-back-button" onClick={() => setActiveView("reports")}><ArrowLeft size={15} /> Kembali ke laporan</button>
        <nav className="admin-record-subnav" aria-label="Navigasi detail laporan">
          {detailTabs.map((tab) => (
            <button type="button" key={tab.id} className={detailTab === tab.id ? "active" : ""} onClick={() => setDetailTab(tab.id)}>
              {tab.label}
              {tab.id === "complaints" && <span>{reportComplaints.length}</span>}
              {tab.id === "evidence" && <span>{evidence.length}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-detail-heading">
          <div><span className="admin-overline">RINCIAN LAPORAN</span><h1>{selectedReport.description || "Laporan warga"}</h1><p><MapPin size={14} /> {selectedReport.location || "Lokasi belum dicantumkan"}</p></div>
          <span className={`admin-pill stage-${stage}`}>{STAGE_LABELS[stage]}</span>
        </div>
        <AdminRouteTimeline progress={progress} />

        <div className={`admin-detail-grid ${detailTab === "overview" ? "" : "is-hidden"}`}>
          <article className="admin-panel admin-detail-main">
            <div className="admin-panel-heading"><div><span className="admin-overline">INFORMASI MASALAH</span><h2>Gambaran laporan</h2></div><span className={`admin-pill priority-pill priority-${getPriorityLevel(selectedReport.priority)}`}>{priorityLabel(selectedReport.priority)}</span></div>
            <div className="admin-detail-facts">
              <div><small>Kategori</small><strong>{selectedReport.category || "Belum dikategorikan"}</strong></div>
              <div><small>Tanggal masuk</small><strong>{formatDate(selectedReport.created_at, true)}</strong></div>
              <div><small>ID laporan</small><strong className="admin-mono">{selectedReport.id.slice(0, 8).toUpperCase()}</strong></div>
              <div><small>Jumlah keluhan</small><strong>{reportComplaints.length} keluhan warga</strong></div>
            </div>
            <div className="admin-detail-copy"><span>RINGKASAN</span><p>{selectedReport.summary || "Belum ada ringkasan untuk laporan ini."}</p></div>
            <div className="admin-detail-copy"><span>REKOMENDASI PENANGANAN</span><p>{selectedReport.recommendation || "Belum ada rekomendasi yang disimpan."}</p></div>
            {selectedReport.latitude != null && selectedReport.longitude != null && Number.isFinite(Number(selectedReport.latitude)) && Number.isFinite(Number(selectedReport.longitude)) && (
              <div className="admin-coordinates"><MapPin size={14} /> {Number(selectedReport.latitude).toFixed(5)}, {Number(selectedReport.longitude).toFixed(5)}</div>
            )}
          </article>

          <aside className="admin-detail-side">
            <article className="admin-panel">
              <div className="admin-panel-heading"><div><span className="admin-overline">PENANGGUNG JAWAB</span><h2>Penugasan relawan</h2></div><Users size={18} /></div>
              {assignment ? (
                <div className="admin-owner-card">
                  <span className="admin-owner-avatar">{initials(volunteer?.full_name)}</span>
                  <div><strong>{volunteer?.full_name || "Relawan"}</strong><small>{volunteer?.phone || "Kontak tidak dicantumkan"}</small></div>
                  <span className={`admin-pill ${assignment.status === "verified" ? "stage-done" : assignment.status === "proof_submitted" ? "stage-verification" : "stage-progress"}`}>{assignment.status === "proof_submitted" ? "Menunggu verifikasi" : assignment.status === "verified" ? "Terverifikasi" : assignment.status === "rejected" ? "Perlu perbaikan" : "Berjalan"}</span>
                </div>
              ) : <div className="admin-empty compact"><Users size={18} /><span>Belum ada relawan yang mengambil laporan ini.</span></div>}
              {evidence.length > 0 && <div className="admin-evidence-note"><strong>{evidence.length} catatan bukti</strong>{evidence.map((item) => <p key={item.id}>{item.note || "Relawan mengirim bukti tanpa catatan."}<small>{formatDate(item.created_at, true)}</small></p>)}</div>}
              {assignment?.status === "proof_submitted" && <button type="button" className="admin-button admin-button-primary admin-full-button" onClick={() => setActiveView("verification")}>Buka verifikasi <ArrowUpRight size={14} /></button>}
            </article>
            <article className="admin-panel admin-complaints-panel">
              <div className="admin-panel-heading"><div><span className="admin-overline">RIWAYAT WARGA</span><h2>Keluhan tergabung</h2></div><span className="admin-mini-count">{reportComplaints.length}</span></div>
              <div className="admin-complaint-list">
                {reportComplaints.slice(0, 5).map((item) => (
                  <div className="admin-complaint-item" key={item.id}>
                    <span className="admin-complaint-marker" />
                    <div><p>{item.description || "Keluhan warga"}</p><small>{item.is_initial ? "Keluhan awal" : "Keluhan tambahan"} · {formatDate(item.created_at)}</small></div>
                  </div>
                ))}
              </div>
              {reportComplaints.length > 5 && <small className="admin-muted">Menampilkan 5 dari {reportComplaints.length} keluhan.</small>}
            </article>
          </aside>
        </div>

        {detailTab === "handling" && (
          <div className="admin-detail-grid admin-tab-content">
            <article className="admin-panel admin-detail-main">
              <div className="admin-panel-heading"><div><span className="admin-overline">LANGKAH TINDAK LANJUT</span><h2>Rencana penanganan</h2><p>Rekomendasi AI dan status kerja laporan ini.</p></div><span className={`admin-pill stage-${stage}`}>{STAGE_LABELS[stage]}</span></div>
              <div className="admin-detail-copy"><span>REKOMENDASI</span><p>{selectedReport.recommendation || "Belum ada rekomendasi tersimpan."}</p></div>
              <div className="admin-detail-copy"><span>RINGKASAN MASALAH</span><p>{selectedReport.summary || selectedReport.description || "Ringkasan belum tersedia."}</p></div>
              <div className="admin-detail-facts">
                <div><small>Prioritas</small><strong>{priorityLabel(selectedReport.priority)}</strong></div>
                <div><small>Status sekarang</small><strong>{STAGE_LABELS[stage]}</strong></div>
                <div><small>Keluhan tergabung</small><strong>{reportComplaints.length}</strong></div>
                <div><small>Relawan ditugaskan</small><strong>{assignment ? "Sudah ditangani" : "Belum diambil"}</strong></div>
              </div>
            </article>
            <aside className="admin-panel admin-detail-main">
              <div className="admin-panel-heading"><div><span className="admin-overline">PELAKSANA</span><h2>Relawan penanggung jawab</h2></div><Users size={18} /></div>
              {assignment ? <div className="admin-owner-card"><span className="admin-owner-avatar">{initials(volunteer?.full_name)}</span><div><strong>{volunteer?.full_name || "Relawan"}</strong><small>{volunteer?.phone || "Kontak belum dicantumkan"}</small></div></div> : <div className="admin-empty compact"><Users size={18} /><span>Belum ada relawan mengambil tugas ini.</span></div>}
              {assignment?.status === "proof_submitted" && <button type="button" className="admin-button admin-button-primary admin-full-button" onClick={() => setActiveView("verification")}>Buka verifikasi <ArrowUpRight size={14} /></button>}
            </aside>
          </div>
        )}

        {detailTab === "complaints" && (
          <section className="admin-panel admin-tab-list-panel">
            <div className="admin-panel-heading"><div><span className="admin-overline">SUARA WARGA</span><h2>{reportComplaints.length} keluhan tergabung</h2><p>Semua keluhan tetap disimpan di bawah laporan utama ini.</p></div><span className="admin-mini-count">{reportComplaints.length}</span></div>
            <div className="admin-complaint-list">
              {reportComplaints.map((item) => (
                <div className="admin-complaint-item" key={item.id}>
                  <span className="admin-complaint-marker" />
                  <div><p>{item.description || "Keluhan warga"}</p><small>{item.is_initial ? "Keluhan awal" : "Keluhan tambahan"} · {formatDate(item.created_at, true)}</small></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {detailTab === "history" && (
          <section className="admin-panel admin-tab-list-panel">
            <div className="admin-panel-heading"><div><span className="admin-overline">JEJAK AKTIVITAS</span><h2>Riwayat laporan</h2><p>Urutan perubahan dan aktivitas yang tercatat pada laporan.</p></div><span className="admin-mini-count">{historyItems.length} aktivitas</span></div>
            <div className="admin-history-list">
              {historyItems.map((item) => (
                <article className="admin-history-item" key={item.id}>
                  <span className="admin-history-dot" />
                  <div><strong>{item.title}</strong><p>{item.description || "Aktivitas TUNTAS"}</p><small>{formatDate(item.created_at, true)}</small></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {detailTab === "evidence" && (
          <section className="admin-panel admin-tab-list-panel">
            <div className="admin-panel-heading"><div><span className="admin-overline">HASIL LAPANGAN</span><h2>Bukti dan catatan relawan</h2><p>Catatan yang dikirim untuk mendukung penyelesaian laporan.</p></div><span className="admin-mini-count">{evidence.length}</span></div>
            {evidence.length === 0 ? (
              <div className="admin-empty"><ShieldCheck size={20} /><strong>Belum ada bukti yang dikirim.</strong><span>Bukti relawan akan tampil di sini setelah tugas diperbarui.</span></div>
            ) : (
              <div className="admin-evidence-grid">
                {evidence.map((item) => <article className="admin-evidence-card" key={item.id}><span className="admin-evidence-icon"><ShieldCheck size={16} /></span><div><strong>{item.note || "Bukti pekerjaan lapangan"}</strong><small>{formatDate(item.created_at, true)}</small></div></article>)}
              </div>
            )}
          </section>
        )}
      </section>
    );
  }

  function renderVolunteers() {
    const activityByVolunteer = volunteerActivity;
    return (
      <section className="admin-page-section">
        <div className="admin-page-heading"><div><span className="admin-overline">KOLABORASI LAPANGAN</span><h1>Direktori relawan</h1><p>Pilih salah satu relawan untuk membuka portofolio dan melihat seluruh kontribusinya.</p></div><span className="admin-page-count">{data.volunteers.length} relawan</span></div>
        <div className="admin-volunteer-grid">
          {data.volunteers.length === 0 ? <div className="admin-panel admin-empty"><Users size={20} /><strong>Belum ada profil relawan.</strong><span>Relawan akan muncul setelah melengkapi profil.</span></div> : data.volunteers.map((volunteer) => {
            const activity = activityByVolunteer.get(volunteer.user_id) || { active: 0, verified: 0 };
            return (
              <button
                type="button"
                className="admin-panel admin-volunteer-card"
                key={volunteer.user_id}
                onClick={() => openVolunteerPortfolio(volunteer)}
                aria-label={`Buka portofolio ${volunteer.full_name}`}
              >
                <div className="admin-volunteer-card-top"><span className="admin-owner-avatar">{initials(volunteer.full_name)}</span><span className={`admin-pill ${activity.active > 0 ? "stage-progress" : "stage-new"}`}>{activity.active > 0 ? "Aktif" : "Terdaftar"}</span></div>
                <h3>{volunteer.full_name}</h3><p>{volunteer.phone || "Kontak belum ditambahkan"}</p>
                <div className="admin-volunteer-stats"><div><strong>{activity.active}</strong><small>Tugas aktif</small></div><div><strong>{activity.verified}</strong><small>Terverifikasi</small></div></div>
                <span className="admin-volunteer-card-action">Lihat portofolio <ArrowUpRight size={13} /></span>
                <small className="admin-muted">Bergabung {formatDate(volunteer.created_at)}</small>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderVolunteerPortfolio() {
    if (!selectedVolunteer) {
      return (
        <div className="admin-panel admin-empty-page">
          <Users size={22} />
          <strong>Profil relawan tidak ditemukan.</strong>
          <button type="button" className="admin-button admin-button-quiet" onClick={() => setActiveView("volunteers")}>Kembali ke direktori relawan</button>
        </div>
      );
    }

    const tasks = selectedVolunteerAssignments.map((assignment) => ({
      assignment,
      report: reportById.get(assignment.report_id) || null,
      evidenceCount: evidenceCountByAssignment.get(assignment.id) || 0,
    }));
    const totalTasks = tasks.length;
    const activeTasks = tasks.filter(({ assignment }) => ["claimed", "proof_submitted"].includes(assignment.status)).length;
    const completedTasks = tasks.filter(({ assignment }) => assignment.status === "verified").length;
    const pendingTasks = tasks.filter(({ assignment }) => assignment.status === "proof_submitted").length;
    const needsRevision = tasks.filter(({ assignment }) => assignment.status === "rejected").length;

    return (
      <section className="admin-page-section admin-volunteer-portfolio">
        <button type="button" className="admin-back-button" onClick={() => setActiveView("volunteers")}><ArrowLeft size={15} /> Kembali ke direktori relawan</button>

        <section className="admin-portfolio-hero">
          <div className="admin-portfolio-orbit" aria-hidden="true"><i /><b /></div>
          <div className="admin-portfolio-identity">
            <span className="admin-portfolio-avatar">{initials(selectedVolunteer.full_name)}</span>
            <div>
              <span className="admin-overline"><span className="admin-live-dot" /> VOLUNTEER PORTFOLIO</span>
              <h1>{selectedVolunteer.full_name}</h1>
              <p>Relawan TUNTAS sejak {formatDate(selectedVolunteer.created_at)}</p>
              <div className="admin-portfolio-contact">
                <span><Users size={13} /> Anggota komunitas TUNTAS</span>
                {selectedVolunteer.phone && <a href={`tel:${selectedVolunteer.phone.replace(/[^+\\d]/g, "")}`}><ShieldCheck size={13} /> {selectedVolunteer.phone}</a>}
              </div>
            </div>
          </div>
          <span className={`admin-portfolio-status ${activeTasks > 0 ? "is-active" : "is-idle"}`}><i /> {activeTasks > 0 ? "Sedang aktif di lapangan" : "Tidak ada tugas aktif"}</span>
        </section>

        <div className="admin-portfolio-stats">
          <article className="admin-portfolio-stat stat-total"><span>Total kontribusi</span><strong>{totalTasks.toLocaleString("id-ID")}</strong><small>Seluruh tugas yang pernah diambil</small></article>
          <article className="admin-portfolio-stat stat-complete"><span>Tugas terselesaikan</span><strong>{completedTasks.toLocaleString("id-ID")}</strong><small>Bukti sudah disetujui admin</small></article>
          <article className="admin-portfolio-stat stat-active"><span>Sedang ditangani</span><strong>{activeTasks.toLocaleString("id-ID")}</strong><small>Tugas aktif saat ini</small></article>
          <article className="admin-portfolio-stat stat-review"><span>Menunggu verifikasi</span><strong>{pendingTasks.toLocaleString("id-ID")}</strong><small>Bukti menunggu pemeriksaan</small></article>
        </div>

        <div className="admin-portfolio-main">
          <section className="admin-panel admin-portfolio-task-panel">
            <div className="admin-panel-heading">
              <div><span className="admin-overline">JEJAK KONTRIBUSI</span><h2>Portofolio tugas</h2><p>Daftar tugas dan hasil kerja yang tercatat di TUNTAS.</p></div>
              <span className="admin-mini-count">{totalTasks} tugas</span>
            </div>
            {tasks.length === 0 ? (
              <div className="admin-empty"><ClipboardList size={20} /><strong>Belum ada kontribusi tercatat.</strong><span>Tugas relawan akan muncul di sini setelah mengambil laporan.</span></div>
            ) : (
              <div className="admin-portfolio-task-list">
                {tasks.map(({ assignment, report, evidenceCount }) => (
                  <article className="admin-portfolio-task" key={assignment.id}>
                    <span className={`admin-portfolio-task-marker stage-${assignmentStatusTone(assignment.status)}`}><ClipboardList size={15} /></span>
                    <div className="admin-portfolio-task-copy">
                      <span className="admin-card-category">{report?.category || "Laporan TUNTAS"}</span>
                      <strong>{report?.description || "Rincian laporan tidak tersedia"}</strong>
                      <small>{report?.location || "Lokasi tidak tersedia"} · {formatDate(assignment.claimed_at || assignment.created_at, true)}</small>
                      {assignment.review_note && <p>Catatan verifikasi: {assignment.review_note}</p>}
                      <span className="admin-portfolio-task-meta">
                        <span className={`admin-pill stage-${assignmentStatusTone(assignment.status)}`}>{assignmentStatusLabel(assignment.status)}</span>
                        {evidenceCount > 0 && <small>{evidenceCount} catatan bukti</small>}
                        {assignment.reviewed_at && <small>Ditinjau {formatDate(assignment.reviewed_at, true)}</small>}
                      </span>
                    </div>
                    {report && <button type="button" className="admin-portfolio-open-task" onClick={() => openReport(report)} aria-label="Buka rincian laporan"><ChevronRight size={17} /></button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="admin-panel admin-portfolio-side">
            <span className="admin-overline">RINGKASAN RELAWAN</span>
            <h2>Kontribusi nyata</h2>
            <p>Portofolio ini merangkum aktivitas yang benar-benar tercatat pada sistem TUNTAS.</p>
            <div className="admin-portfolio-progress">
              <div><span>Tingkat penyelesaian tugas</span><strong>{totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%</strong></div>
              <span className="admin-portfolio-progress-track"><i style={{ width: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%` }} /></span>
            </div>
            <div className="admin-portfolio-side-facts">
              <div><span><ShieldCheck size={14} /> Perlu perbaikan</span><strong>{needsRevision}</strong></div>
              <div><span><Clock3 size={14} /> Bergabung</span><strong>{formatDate(selectedVolunteer.created_at)}</strong></div>
              <div><span><ClipboardList size={14} /> Terakhir diperbarui</span><strong>{formatDate(selectedVolunteer.updated_at)}</strong></div>
            </div>
            <div className="admin-portfolio-note"><CheckCircle2 size={16} /><span>Data berasal dari riwayat penugasan dan verifikasi yang tersimpan di database TUNTAS.</span></div>
          </aside>
        </div>
      </section>
    );
  }

  const navItems = [
    { id: "desk", label: "Desk", icon: LayoutDashboard },
    { id: "pipeline", label: "Pipeline", icon: Activity },
    { id: "reports", label: "Laporan", icon: FileText, count: data.reports.length },
    { id: "volunteers", label: "Relawan", icon: Users, count: data.volunteers.length },
    { id: "verification", label: "Verifikasi", icon: ShieldCheck, count: pendingCount },
  ];

  return (
    <main className={`admin-shell ${theme === "light" ? "is-light" : ""}`}>
      <div className="admin-atmosphere" aria-hidden="true"><span /><i /><b /></div>
      {themeTransitionKey > 0 && <div key={themeTransitionKey} className={`admin-theme-wipe ${theme === "light" ? "to-light" : "to-dark"}`} aria-hidden="true" />}
      <header className="admin-topbar">
        <button type="button" className="admin-brand" onClick={() => setActiveView("desk")} aria-label="TUNTAS Desk">
          <span className="admin-brand-mark">T</span>
          <span><strong>TUNTAS</strong><small>ADMIN WORKSPACE</small></span>
        </button>
        <nav className="admin-nav" aria-label="Navigasi dashboard admin">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button type="button" key={id} className={activeView === id || (activeView === "detail" && id === "reports") || (activeView === "volunteer-portfolio" && id === "volunteers") ? "active" : ""} onClick={() => setActiveView(id)}>
              {label}{typeof count === "number" && <span>{count}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-top-actions">
          <label className="admin-search admin-header-search"><Search size={15} /><input value={search} onChange={(event) => { setSearch(event.target.value); if (activeView === "desk") setActiveView("reports"); }} placeholder="Cari laporan..." aria-label="Cari laporan" /></label>
          <button type="button" className="admin-new-button" onClick={onExit} title="Buka portal warga untuk membuat laporan baru"><span>＋</span> Laporan baru</button>
          <button type="button" className="admin-icon-button" onClick={() => void loadDashboard()} disabled={loading} aria-label="Segarkan data dashboard" title="Segarkan data"><RefreshCw size={16} className={loading ? "admin-refresh-spin" : ""} /></button>
          <button type="button" className="admin-icon-button" onClick={() => {
            setTheme((value) => value === "dark" ? "light" : "dark");
            setThemeTransitionKey((value) => value + 1);
          }} aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"} title="Ganti tema">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" className="admin-icon-button admin-notification-button" onClick={() => setActiveView("verification")} aria-label={`${pendingCount} bukti menunggu verifikasi`} title="Antrean verifikasi">
            <Bell size={17} />{pendingCount > 0 && <i>{pendingCount > 9 ? "9+" : pendingCount}</i>}
          </button>
          <button type="button" className="admin-user-button" onClick={signOut} title="Keluar dari akun admin">
            <span>{initials(displayName)}</span><small>Keluar</small><ChevronDown size={13} />
          </button>
        </div>
      </header>

      <div className="admin-workspace-crumb">
        <span>Workspace</span><ChevronRight size={13} /><strong>{navItems.find((item) => item.id === activeView)?.label || (activeView === "detail" ? "Rincian laporan" : activeView === "volunteer-portfolio" ? "Portofolio relawan" : "Verifikasi")}</strong>
        <span className="admin-online-state"><i /> Sistem aktif <b /> {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
      </div>

      <div className="admin-content">
        {refreshError && <div className="admin-alert"><Activity size={16} /><span>{refreshError}</span><button type="button" onClick={() => setRefreshError("")} aria-label="Tutup pesan">×</button></div>}
        {loading && data.reports.length === 0 ? (
          <div className="admin-loading"><span /><strong>Menyiapkan dashboard TUNTAS...</strong><small>Mengambil data laporan dan aktivitas relawan.</small></div>
        ) : (
          <div className="admin-view-stage" key={`${activeView}-${selectedReportId || ""}`}>
            {activeView === "desk" && renderDesk()}
            {activeView === "pipeline" && renderPipeline()}
            {activeView === "reports" && renderReports()}
            {activeView === "detail" && renderDetail()}
            {activeView === "volunteers" && renderVolunteers()}
            {activeView === "volunteer-portfolio" && renderVolunteerPortfolio()}
            {activeView === "verification" && <div className="admin-verification-view"><VolunteerCenter user={user} onAdminDataChanged={loadDashboard} /></div>}
          </div>
        )}
        <footer className="admin-footer"><span>TUNTAS · Civic Action Workspace</span><button type="button" onClick={onExit}>Kembali ke portal warga <ArrowUpRight size={13} /></button></footer>
      </div>
    </main>
  );
}
