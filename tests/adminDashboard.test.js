import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChartPaths,
  escapeCsvCell,
  buildReportSeries,
  getAdminMetrics,
  getPipelineStage,
  getPriorityLevel,
  buildVolunteerActivity,
} from "../src/lib/adminDashboard.js";

test("report statuses map to the correct pipeline stages", () => {
  assert.equal(getPipelineStage("Baru"), "new");
  assert.equal(getPipelineStage("Dikerjakan"), "progress");
  assert.equal(getPipelineStage("Menunggu Verifikasi"), "verification");
  assert.equal(getPipelineStage("Perlu Perbaikan"), "revision");
  assert.equal(getPipelineStage("Selesai"), "done");
});

test("priority classification accepts AI-generated labels", () => {
  assert.equal(getPriorityLevel("Darurat — segera"), "high");
  assert.equal(getPriorityLevel("Rendah"), "low");
  assert.equal(getPriorityLevel("Perlu pemantauan"), "medium");
});

test("admin metrics count unique active volunteers and workflow totals", () => {
  const reports = [
    { status: "Baru", priority: "Tinggi" },
    { status: "Dikerjakan", priority: "Sedang" },
    { status: "Selesai", priority: "Darurat" },
    { status: "Perlu Perbaikan", priority: "Kritis" },
  ];
  const assignments = [
    { volunteer_id: "a", status: "claimed" },
    { volunteer_id: "a", status: "proof_submitted" },
    { volunteer_id: "b", status: "claimed" },
    { volunteer_id: "c", status: "verified" },
  ];
  const metrics = getAdminMetrics(reports, assignments, [{ user_id: "a" }]);
  assert.equal(metrics.totalReports, 4);
  assert.equal(metrics.newReports, 1);
  assert.equal(metrics.highPriority, 2);
  assert.equal(metrics.activeVolunteers, 2);
  assert.equal(metrics.waitingVerification, 1);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.volunteerCount, 1);
  assert.equal(metrics.activeAssignments, 3);
  assert.equal(getAdminMetrics([], [], [], 123).totalReports, 123);
});

test("report series includes zero days and groups by local calendar day", () => {
  const now = new Date(2026, 10, 22, 12, 0, 0);
  const today = new Date(2026, 10, 22, 8, 0, 0).toISOString();
  const yesterday = new Date(2026, 10, 21, 8, 0, 0).toISOString();
  const series = buildReportSeries([
    { created_at: today },
    { created_at: today },
    { created_at: yesterday },
    { created_at: "not-a-date" },
  ], 3, now);
  assert.deepEqual(series.map((item) => item.value), [0, 1, 2]);
  assert.equal(series.length, 3);
});

test("chart path builder handles empty, single and multiple points", () => {
  assert.deepEqual(buildChartPaths([]), { line: "", area: "", points: [] });
  const single = buildChartPaths([{ value: 0 }]);
  assert.match(single.line, /^M /);
  assert.equal(single.points.length, 1);
  const multi = buildChartPaths([{ value: 1 }, { value: 4 }, { value: 2 }]);
  assert.match(multi.area, /Z$/);
  assert.equal(multi.points.length, 3);
  assert.ok(multi.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test("CSV escaping quotes values and neutralizes spreadsheet formulas", () => {
  assert.equal(escapeCsvCell("=2+2"), "\"'=2+2\"");
  assert.equal(escapeCsvCell("a\"b"), "\"a\"\"b\"");
  assert.equal(escapeCsvCell("Laporan biasa"), "\"Laporan biasa\"");
});

test("CSV escaping neutralizes formulas after leading whitespace", () => {
  assert.equal(escapeCsvCell("  =2+2"), "\"'  =2+2\"");
  assert.equal(escapeCsvCell("\t@SUM(A1:A2)"), "\"'\t@SUM(A1:A2)\"");
});

test("volunteer activity aggregates active and verified tasks in one pass", () => {
  const stats = buildVolunteerActivity([
    { volunteer_id: "v1", status: "claimed" },
    { volunteer_id: "v1", status: "proof_submitted" },
    { volunteer_id: "v1", status: "verified" },
    { volunteer_id: "v1", status: "verified" },
    { volunteer_id: "v2", status: "cancelled" },
    { volunteer_id: null, status: "claimed" },
  ]);
  assert.deepEqual(stats.get("v1"), { active: 2, verified: 2 });
  assert.deepEqual(stats.get("v2"), { active: 0, verified: 0 });
  assert.equal(stats.has(null), false);
});
