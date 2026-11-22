export const PIPELINE_STAGES = [
  { id: "new", label: "Baru", tone: "aqua" },
  { id: "progress", label: "Dikerjakan", tone: "blue" },
  { id: "verification", label: "Menunggu verifikasi", tone: "amber" },
  { id: "revision", label: "Perlu perbaikan", tone: "rose" },
  { id: "done", label: "Selesai", tone: "green" },
];

export function getPipelineStage(status) {
  const value = String(status || "").trim().toLocaleLowerCase("id-ID");
  if (value.includes("selesai")) return "done";
  if (value.includes("menunggu verifikasi")) return "verification";
  if (value.includes("perlu perbaikan")) return "revision";
  if (value.includes("dikerjakan")) return "progress";
  return "new";
}

export function getPriorityLevel(priority) {
  const value = String(priority || "").trim().toLocaleLowerCase("id-ID");
  if (/kritis|darurat|sangat tinggi|tinggi|mendesak|segera/.test(value)) return "high";
  if (/rendah|rutin|minor|terpantau/.test(value)) return "low";
  return "medium";
}

export function getAdminMetrics(reports = [], assignments = [], volunteers = [], totalReportCount = reports.length) {
  const activeAssignments = assignments.filter((item) =>
    ["claimed", "proof_submitted"].includes(item.status)
  );
  const activeVolunteerIds = new Set(activeAssignments.map((item) => item.volunteer_id).filter(Boolean));
  const parsedReportCount = Number(totalReportCount);
  const safeReportCount = Number.isFinite(parsedReportCount)
    ? Math.max(0, Math.floor(parsedReportCount))
    : reports.length;
  return {
    totalReports: safeReportCount,
    newReports: reports.filter((item) => getPipelineStage(item.status) === "new").length,
    highPriority: reports.filter((item) =>
      getPriorityLevel(item.priority) === "high" && getPipelineStage(item.status) !== "done"
    ).length,
    activeVolunteers: activeVolunteerIds.size,
    waitingVerification: assignments.filter((item) => item.status === "proof_submitted").length,
    completed: reports.filter((item) => getPipelineStage(item.status) === "done").length,
    volunteerCount: volunteers.length,
    activeAssignments: activeAssignments.length,
  };
}

export function buildVolunteerActivity(assignments = []) {
  const activityByVolunteer = new Map();

  for (const assignment of assignments) {
    const volunteerId = assignment?.volunteer_id;
    if (!volunteerId) continue;

    let activity = activityByVolunteer.get(volunteerId);
    if (!activity) {
      activity = { active: 0, verified: 0 };
      activityByVolunteer.set(volunteerId, activity);
    }

    if (assignment.status === "claimed" || assignment.status === "proof_submitted") {
      activity.active += 1;
    } else if (assignment.status === "verified") {
      activity.verified += 1;
    }
  }

  return activityByVolunteer;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildReportSeries(reports = [], days = 7, now = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Math.floor(Number(days) || 7)));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - safeDays + 1);
  const counts = new Map();

  for (const report of reports) {
    if (!report?.created_at) continue;
    const date = new Date(report.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDateKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date),
      value: counts.get(key) || 0,
    };
  });
}

export function buildChartPaths(series = [], width = 640, height = 220, padding = 18) {
  if (!series.length) return { line: "", area: "", points: [] };
  const max = Math.max(1, ...series.map((item) => Number(item.value) || 0));
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const points = series.map((item, index) => ({
    x: padding + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth),
    y: height - padding - ((Number(item.value) || 0) / max) * innerHeight,
  }));
  const line = points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L ${last.x.toFixed(2)} ${(height - padding).toFixed(2)} L ${first.x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;
  return { line, area, points };
}

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  const safe = /^\s*[=+@-]/.test(text) ? String.fromCharCode(39) + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
