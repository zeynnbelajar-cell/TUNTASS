import React, { useCallback, useEffect, useState } from "react";
import * as tus from "tus-js-client";
import {
  Sparkles,
  MapPin,
  Send,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock3,
  Database,
  Users,
  Paperclip,
  FileImage,
  FileVideo,
  FileText,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { isNetworkUnavailable } from "./lib/networkStatus";
import LocationPicker from "./components/LocationPicker";
import AuthPanel from "./components/AuthPanel";
import VolunteerCenter from "./components/VolunteerCenter";

const ATTACHMENT_BUCKET = "citizen-report-attachments";
const ATTACHMENT_LIMIT = 10;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const STORAGE_TUS_ENDPOINT = SUPABASE_URL
  ? SUPABASE_URL.replace(".supabase.co", ".storage.supabase.co") + "/storage/v1/upload/resumable"
  : "";

const SAFE_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif",
  "video/mp4", "video/webm", "video/quicktime", "video/mpeg", "video/ogg",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm",
]);
const SAFE_ATTACHMENT_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed", "application/octet-stream",
  "text/plain", "text/csv", "text/rtf",
]);

function getAttachmentType(file) {
  const type = file.type || "application/octet-stream";
  const lowerName = file.name.toLowerCase();
  if (type === "image/svg+xml" || type === "text/html" || type === "application/javascript") return null;
  if (SAFE_MEDIA_TYPES.has(type)) return type;
  if (SAFE_ATTACHMENT_TYPES.has(type)) return type;
  const byExtension = {
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip", ".txt": "text/plain", ".csv": "text/csv",
    ".rtf": "text/rtf", ".7z": "application/octet-stream",
    ".rar": "application/octet-stream", ".bin": "application/octet-stream",
  };
  const extension = Object.keys(byExtension).find((key) => lowerName.endsWith(key));
  return extension ? byExtension[extension] : null;
}

function attachmentKind(type) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

function attachmentLabel(type) {
  const kind = attachmentKind(type);
  return kind === "image" ? "Gambar" : kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Dokumen";
}

function formatFileSize(value) {
  if (!Number.isFinite(value) || value < 0) return "Ukuran tidak diketahui";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "Waktu belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak valid";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function priorityClass(priority) {
  const value = String(priority || "").toLowerCase();
  if (/kritis|darurat|sangat tinggi|tinggi|segera|mendesak/.test(value)) return "tinggi";
  if (/rendah|rutin|terpantau|minor/.test(value)) return "rendah";
  return "sedang";
}

function validMapCoordinates(value) {
  return (
    value &&
    Number.isFinite(Number(value.latitude)) &&
    Number.isFinite(Number(value.longitude)) &&
    Number(value.latitude) >= -90 && Number(value.latitude) <= 90 &&
    Number(value.longitude) >= -180 && Number(value.longitude) <= 180
  );
}

function mapContextLabel(status) {
  const labels = {
    verified: "Alamat jalan/tempat cocok dengan data peta",
    matched: "Area wilayah ditemukan pada data peta",
    low_confidence: "Kecocokan alamat perlu diperiksa",
    not_found: "Alamat tidak ditemukan pada data peta",
    unavailable: "Layanan peta tidak dapat dihubungi",
    not_configured: "Pemeriksaan peta belum diaktifkan",
    not_provided: "Lokasi belum diperiksa melalui peta",
  };
  return labels[status] || "Konteks peta belum tersedia";
}

async function getFunctionErrorMessage(functionError) {
  const response = functionError?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null);
    if (typeof payload?.error === "string") return payload.error;
  }
  return functionError?.message || "Layanan gagal memproses laporan. Coba lagi.";
}

export default function App() {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [result, setResult] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [savedReport, setSavedReport] = useState(null);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [savedComplaintId, setSavedComplaintId] = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);
  const [reportEditFields, setReportEditFields] = useState({});
  const [savingReportEdit, setSavingReportEdit] = useState(false);
  const [adminFileBusy, setAdminFileBusy] = useState(null);
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [savedComplaintUploadToken, setSavedComplaintUploadToken] = useState(null);
  const [attachmentUpload, setAttachmentUpload] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationSource, setLocationSource] = useState("manual");
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationContext, setLocationContext] = useState(null);
  const [reports, setReports] = useState([]);
  const [complaintsByReport, setComplaintsByReport] = useState({});
  const [attachmentsByComplaint, setAttachmentsByComplaint] = useState({});
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const isAdmin = user?.app_metadata?.tuntas_role === "admin";

  useEffect(() => {
    const previews = attachmentFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: attachmentKind(getAttachmentType(file) || ""),
    }));
    setAttachmentPreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [attachmentFiles]);
  useEffect(() => {
    const revealSelector = "[data-mask-reveal]";
    const cardSelector = [
      ".report-card",
      ".result-panel",
      ".report-item",
      ".attachment-preview-card",
      ".volunteer-center",
      ".volunteer-stats > div",
      ".volunteer-profile-form",
      ".volunteer-panel-section",
      ".available-task",
      ".assignment-card",
      ".auth-entry",
      ".auth-account",
    ].join(",");
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const prepareTarget = (element) => {
      if (!(element instanceof HTMLElement)) return;

      const isCard = element.matches(cardSelector);
      const isReveal = element.matches(revealSelector);
      if (!isCard && !isReveal) return;

      if (isCard && element.dataset.assemblePrepared !== "true") {
        element.dataset.assemblePrepared = "true";
        element.dataset.scrollAssemble = "";
        Array.from(element.children).forEach((part, index) => {
          part.dataset.assemblePart = "";
          part.dataset.assembleSide = index % 2 === 0 ? "left" : "right";
          part.style.setProperty("--assemble-index", String(index % 4));
        });
      }

      if (prefersReducedMotion || !("IntersectionObserver" in window)) {
        element.classList.add("is-revealed", "is-in-view");
        return;
      }

      observer.observe(element);
    };

    if (!("IntersectionObserver" in window)) {
      document.documentElement.classList.add("no-scroll-observer");
      document.querySelectorAll(revealSelector + "," + cardSelector).forEach(prepareTarget);
      return undefined;
    }

    if (prefersReducedMotion) {
      document.querySelectorAll(revealSelector + "," + cardSelector).forEach(prepareTarget);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const visible = entry.isIntersecting;
        entry.target.classList.toggle("is-in-view", visible);
        if (entry.target.matches(revealSelector)) {
          entry.target.classList.toggle("is-revealed", visible);
        }
      });
    }, { threshold: 0.02, rootMargin: "0px 0px -6% 0px" });

    const scanTargets = (rootNode) => {
      if (rootNode instanceof Element) prepareTarget(rootNode);
      rootNode.querySelectorAll?.(revealSelector + "," + cardSelector).forEach(prepareTarget);
    };

    scanTargets(document);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scanTargets(node);
        });
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const navigation = document.querySelector(".topbar");
    if (!navigation) return undefined;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const handleNavigation = (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const link = event.target.closest?.('a[href^="#"]');
      if (!link || !navigation.contains(link)) return;

      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      window.history.replaceState(window.history.state, "", link.hash);
    };

    navigation.addEventListener("click", handleNavigation);
    return () => navigation.removeEventListener("click", handleNavigation);
  }, []);

  function uploadLargeFile(file, path, token, contentType, onProgress) {
    return new Promise((resolve, reject) => {
      if (!STORAGE_TUS_ENDPOINT || !SUPABASE_PUBLIC_KEY) {
        reject(new Error("Konfigurasi Supabase Storage belum tersedia."));
        return;
      }
      const upload = new tus.Upload(file, {
        endpoint: STORAGE_TUS_ENDPOINT,
        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          "x-signature": token,
        },
        metadata: {
          bucketName: ATTACHMENT_BUCKET,
          objectName: path,
          contentType,
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        removeFingerprintOnSuccess: true,
        uploadDataDuringCreation: true,
        onError: reject,
        onProgress: (uploaded, total) => {
          const percentage = total > 0 ? Math.round((uploaded / total) * 100) : 0;
          onProgress?.(percentage);
        },
        onSuccess: () => resolve(true),
      });

      upload.findPreviousUploads()
        .then((previous) => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        })
        .catch(reject);
    });
  }

  const loadReports = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setReportsError("Supabase belum dikonfigurasi. Periksa file .env.local.");
      setReportsLoading(false);
      return;
    }

    setReportsLoading(true);
    setReportsError("");
    const { data, error: queryError } = await supabase
      .from("reports")
      .select(
        "id, description, location, category, priority, summary, recommendation, status, created_at, latitude, longitude"
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (queryError) {
      if (isNetworkUnavailable(queryError)) {
        setReportsError("Koneksi internet terputus. Data laporan terakhir tetap ditampilkan dan akan dimuat ulang saat online.");
      } else {
        console.error("Gagal memuat laporan:", queryError);
        setReportsError(queryError.message || "Laporan gagal dimuat.");
      }
      // Preserve the last successful data during transient network failures.
      setReportsLoading(false);
      return;
    }

    const reportRows = data || [];
    setReports(reportRows);

    if (reportRows.length === 0) {
      setComplaintsByReport({});
      setAttachmentsByComplaint({});
      setReportsLoading(false);
      return;
    }

    const reportIds = reportRows.map((report) => report.id);
    const { data: complaintRows, error: complaintError } = await supabase
      .from("report_complaints")
      .select("id, report_id, description, location, is_initial, created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: true });

    if (complaintError) {
      if (isNetworkUnavailable(complaintError)) {
        setReportsError("Koneksi internet terputus. Rincian laporan terakhir tetap ditampilkan.");
      } else {
        console.error("Gagal memuat rincian keluhan:", complaintError);
        setReportsError(
          "Laporan utama berhasil dimuat, tetapi rincian keluhan belum tersedia. Pastikan SQL penggabungan laporan sudah dijalankan."
        );
      }
    } else {
      const grouped = {};
      for (const complaint of complaintRows || []) {
        if (!grouped[complaint.report_id]) grouped[complaint.report_id] = [];
        grouped[complaint.report_id].push(complaint);
      }
      setComplaintsByReport(grouped);

      if (complaintRows?.length) {
        const complaintIds = complaintRows.map((item) => item.id);
        const { data: attachmentRows, error: attachmentError } = await supabase
          .from("complaint_attachments")
          .select("id, complaint_id, file_name, content_type, size_bytes, uploaded_at")
          .in("complaint_id", complaintIds)
          .eq("status", "uploaded")
          .order("uploaded_at", { ascending: false });

        if (attachmentError) {
          if (isNetworkUnavailable(attachmentError)) {
            setReportsError("Koneksi internet terputus. Lampiran yang sudah dimuat tetap ditampilkan.");
          } else {
            console.error("Gagal memuat lampiran warga:", attachmentError);
          }
        } else if (attachmentRows?.length) {
          const urlMap = new Map();
          let viewError = null;
          for (let start = 0; start < attachmentRows.length; start += 200) {
            const page = attachmentRows.slice(start, start + 200);
            const { data: viewData, error: pageError } = await supabase.functions.invoke(
              "manage-complaint-attachment",
              { body: { action: "view_many", attachment_ids: page.map((item) => item.id) } }
            );
            if (pageError) {
              viewError = pageError;
              break;
            }
            for (const item of viewData?.attachments || []) urlMap.set(item.id, item.signed_url);
          }
          if (viewError) {
            if (isNetworkUnavailable(viewError)) {
              setReportsError("Koneksi internet terputus. Tautan foto akan diperbarui saat koneksi kembali.");
            } else {
              console.error("Gagal membuat tautan lampiran:", viewError);
            }
          } else {
            const attachmentGroups = {};
            for (const item of attachmentRows) {
              const enriched = { ...item, signedUrl: urlMap.get(item.id) || null };
              if (!attachmentGroups[item.complaint_id]) attachmentGroups[item.complaint_id] = [];
              attachmentGroups[item.complaint_id].push(enriched);
            }
            setAttachmentsByComplaint(attachmentGroups);
          }
        } else {
          setAttachmentsByComplaint({});
        }
      } else {
        setAttachmentsByComplaint({});
      }
    }

    setReportsLoading(false);
  }, [user?.id, user?.app_metadata?.tuntas_role]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    const handleOnline = () => {
      void loadReports();
    };
    const handleOffline = () => {
      setReportsError("Koneksi internet terputus. Data laporan terakhir tetap tersedia di layar.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadReports]);

  // Signed URLs are temporary bearer links. Refresh report attachments before
  // their one-hour lifetime ends, and refresh immediately when returning to a
  // tab that has been left in the background.
  useEffect(() => {
    let lastRefreshAt = Date.now();

    const refreshExpiredAttachmentLinks = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt < 45 * 60 * 1000) return;

      lastRefreshAt = Date.now();
      void loadReports();
    };

    const timer = window.setInterval(refreshExpiredAttachmentLinks, 60 * 1000);
    document.addEventListener("visibilitychange", refreshExpiredAttachmentLinks);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshExpiredAttachmentLinks);
    };
  }, [loadReports]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) console.error("Gagal memeriksa sesi:", sessionError);
      setUser(data?.session?.user || null);
      setAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);


  async function uploadCitizenAttachments(complaintId, uploadToken, filesToUpload) {
    const reservations = [];
    try {
      for (const [index, file] of filesToUpload.entries()) {
        const contentType = getAttachmentType(file);
        if (!contentType) throw new Error("Jenis file tidak didukung: " + file.name);

        const { data: signed, error: signError } = await supabase.functions.invoke(
          "manage-complaint-attachment",
          {
            body: {
              action: "create",
              complaint_id: complaintId,
              upload_token: uploadToken,
              file_name: file.name,
              content_type: contentType,
              size_bytes: file.size,
            },
          }
        );
        if (signError) throw new Error(await getFunctionErrorMessage(signError));
        if (!signed?.path || !signed?.token || !signed?.attachment_id) {
          throw new Error("Server tidak mengembalikan izin unggah yang valid.");
        }
        reservations.push(signed.attachment_id);

        setUploadProgress("Mengunggah " + (index + 1) + "/" + filesToUpload.length + " · " + file.name + " · 0%");
        await uploadLargeFile(file, signed.path, signed.token, contentType, (percentage) => {
          setUploadProgress("Mengunggah " + (index + 1) + "/" + filesToUpload.length + " · " + file.name + " · " + percentage + "%");
        });

        const { error: completeError } = await supabase.functions.invoke(
          "manage-complaint-attachment",
          { body: { action: "complete", attachment_id: signed.attachment_id, upload_token: uploadToken } }
        );
        if (completeError) throw new Error(await getFunctionErrorMessage(completeError));
      }
      setUploadProgress("");
      return filesToUpload.length;
    } catch (uploadError) {
      await Promise.all(
        reservations.map((attachmentId) =>
          supabase.functions.invoke("manage-complaint-attachment", {
            body: { action: "abort", attachment_id: attachmentId, upload_token: uploadToken },
          })
        )
      );
      setUploadProgress("");
      throw uploadError;
    }
  }

  async function retryCitizenAttachments() {
    if (!savedComplaintId || !savedComplaintUploadToken || attachmentFiles.length === 0 || attachmentUpload) return;
    setAttachmentUpload(true);
    setAttachmentStatus("");
    try {
      const count = await uploadCitizenAttachments(savedComplaintId, savedComplaintUploadToken, attachmentFiles);
      setAttachmentStatus(count + " lampiran berhasil dikirim. Warga dan relawan dapat melihatnya; hanya admin yang dapat mengganti atau menghapus.");
      setAttachmentFiles([]);
      setSavedComplaintId(null);
      setSavedComplaintUploadToken(null);
    } catch (uploadError) {
      console.error("Unggah lampiran laporan gagal:", uploadError);
      setAttachmentStatus(
        "Laporan sudah tersimpan, tetapi lampiran belum terkirim: " +
        (uploadError.message || "unggah gagal. Silakan coba kembali.")
      );
    } finally {
      setAttachmentUpload(false);
    }
  }

  function selectAttachmentFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";

    if (selected.length > ATTACHMENT_LIMIT) {
      setError("Pilih maksimal 10 file lampiran.");
      return;
    }
    if (selected.some((file) => file.size < 1 || !getAttachmentType(file))) {
      setError("Ada file yang tidak didukung. Gunakan gambar, video, audio, PDF, dokumen, atau arsip.");
      return;
    }

    setError("");
    setAttachmentFiles(selected);
  }

  function beginReportEdit(report) {
    setEditingReportId(report.id);
    setAdminActionMessage("");
    setReportEditFields({
      description: report.description || "",
      location: report.location || "",
      category: report.category || "Lainnya",
      priority: report.priority || "Sedang",
      summary: report.summary || "",
      recommendation: report.recommendation || "",
    });
  }

  async function saveReportEdit(reportId) {
    if (!isAdmin || savingReportEdit) return;
    setSavingReportEdit(true);
    setAdminActionMessage("");
    try {
      const { error: updateError } = await supabase.functions.invoke(
        "manage-complaint-attachment",
        { body: { action: "admin_update_report", report_id: reportId, fields: reportEditFields } }
      );
      if (updateError) throw new Error(await getFunctionErrorMessage(updateError));
      setEditingReportId(null);
      setAdminActionMessage("Perubahan laporan berhasil disimpan.");
      await loadReports();
    } catch (saveError) {
      setAdminActionMessage("Laporan gagal diperbarui: " + (saveError.message || "coba lagi."));
    } finally {
      setSavingReportEdit(false);
    }
  }

  async function replaceAttachmentAsAdmin(item, file) {
    if (!isAdmin || !file || adminFileBusy) return;
    const contentType = getAttachmentType(file);
    if (!contentType) {
      setAdminActionMessage("Jenis file pengganti tidak didukung.");
      return;
    }

    setAdminFileBusy(item.id);
    setAdminActionMessage("");
    let stagingId = null;
    try {
      const { data: staging, error: prepareError } = await supabase.functions.invoke(
        "manage-complaint-attachment",
        {
          body: {
            action: "admin_prepare_replace",
            attachment_id: item.id,
            file_name: file.name,
            content_type: contentType,
            size_bytes: file.size,
          },
        }
      );
      if (prepareError) throw new Error(await getFunctionErrorMessage(prepareError));
      stagingId = staging?.attachment_id;
      if (!staging?.path || !staging?.token || !stagingId) {
        throw new Error("Server tidak menyiapkan file pengganti.");
      }

      setUploadProgress("Mengunggah file pengganti " + file.name + " · 0%");
      await uploadLargeFile(file, staging.path, staging.token, contentType, (percentage) => {
        setUploadProgress("Mengunggah file pengganti " + file.name + " · " + percentage + "%");
      });

      const { error: completeError } = await supabase.functions.invoke(
        "manage-complaint-attachment",
        { body: { action: "admin_complete_replace", attachment_id: stagingId } }
      );
      if (completeError) throw new Error(await getFunctionErrorMessage(completeError));
      setAdminActionMessage("Lampiran berhasil diganti.");
      await loadReports();
    } catch (replaceError) {
      if (stagingId) {
        await supabase.functions.invoke("manage-complaint-attachment", {
          body: { action: "admin_abort_replace", attachment_id: stagingId },
        });
      }
      setAdminActionMessage("Penggantian lampiran gagal: " + (replaceError.message || "coba lagi."));
    } finally {
      setUploadProgress("");
      setAdminFileBusy(null);
    }
  }

  async function deleteAttachmentAsAdmin(item) {
    if (!isAdmin || adminFileBusy) return;
    if (!window.confirm("Hapus lampiran " + item.file_name + "? Tindakan ini tidak dapat dibatalkan.")) return;
    setAdminFileBusy(item.id);
    setAdminActionMessage("");
    try {
      const { error: deleteError } = await supabase.functions.invoke(
        "manage-complaint-attachment",
        { body: { action: "admin_delete_attachment", attachment_id: item.id } }
      );
      if (deleteError) throw new Error(await getFunctionErrorMessage(deleteError));
      setAdminActionMessage("Lampiran berhasil dihapus.");
      await loadReports();
    } catch (deleteError) {
      setAdminActionMessage("Lampiran gagal dihapus: " + (deleteError.message || "coba lagi."));
    } finally {
      setAdminFileBusy(null);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setError("");
    setSavedReport(null);
    setLocationContext(null);

    if (!isSupabaseConfigured || !supabase) {
      setError(
        "Supabase belum dikonfigurasi. Periksa VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local."
      );
      return;
    }

    const cleanDescription = description.trim();
    const cleanLocation = location.trim();

    if (cleanDescription.length < 1 || cleanDescription.length > 1500) {
      setError("Pesan harus terdiri dari 1–1500 karakter.");
      return;
    }
    if (cleanLocation && locationResolving) {
      setError("Tunggu sampai alamat dari peta selesai ditemukan.");
      return;
    }

    setLoading(true);
    try {
      // 1. Minta Gemini menganalisis laporan melalui Supabase Edge Function.
      const { data: aiData, error: invokeError } = await supabase.functions.invoke(
        "analyze-report",
        {
          body: {
            description: cleanDescription,
            location: cleanLocation,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
            location_source: locationSource,
            history: conversation.slice(-8).map(({ role, content }) => ({ role, content })),
          },
        }
      );

      if (invokeError) {
        throw new Error(await getFunctionErrorMessage(invokeError));
      }
      if (!aiData?.analysis?.answer) {
        throw new Error("Respons AI tidak memiliki jawaban.");
      }

      const analysis = aiData.analysis;
      const userMessage = { role: "user", content: cleanDescription };
      const assistantMessage = {
        role: "assistant",
        content: analysis.answer,
        analysis: analysis.kind === "report" ? analysis : null,
      };

      if (analysis.kind !== "report") {
        setConversation((current) => [...current, userMessage, assistantMessage]);
        setResult(null);
        setDescription("");
        return;
      }

      if (!cleanLocation) {
        const locationPrompt = analysis.answer || "Analisis awal selesai. Tambahkan lokasi kejadian agar laporan dapat disimpan.";
        setConversation((current) => [
          ...current,
          userMessage,
          { role: "assistant", content: locationPrompt, analysis },
        ]);
        setResult(analysis);
        setError("Analisis sudah dibuat. Tambahkan lokasi kejadian untuk menyimpan laporan ini.");
        setDescription("");
        return;
      }

      const mapContext = aiData.location_context || { status: "unavailable", provider: "Geoapify" };
      const mapAddressMatched = ["verified", "matched"].includes(mapContext.status);
      const hasExactUserPoint = ["gps", "map_pin"].includes(locationSource) && validMapCoordinates(coordinates);
      const hasSpecificSearchPoint = locationSource === "search"
        && ["building", "amenity"].includes(mapContext.result_type)
        && mapAddressMatched
        && validMapCoordinates(mapContext.coordinates);
      const mappedCoordinates = hasExactUserPoint
        ? coordinates
        : (hasSpecificSearchPoint ? mapContext.coordinates : null);
      const resolvedLocation = mapAddressMatched && mapContext.formatted_address
        ? mapContext.formatted_address
        : cleanLocation;
      setLocationContext(mapContext);
      setResult(analysis);

      // 2. Kirim hasil AI ke RPC database. Database yang menentukan apakah
      // keluhan menjadi laporan utama baru atau ditambahkan ke laporan utama
      // yang kategorinya sama dan berjarak maksimal 50 meter.
      const { data: submission, error: submissionError } = await supabase.rpc(
        "submit_report_with_deduplication",
        {
          p_description: cleanDescription,
          p_location: resolvedLocation,
          p_latitude: mappedCoordinates?.latitude ?? null,
          p_longitude: mappedCoordinates?.longitude ?? null,
          p_category: analysis.category || "Lainnya",
          p_priority: analysis.priority || "Sedang",
          p_summary: analysis.summary || "Ringkasan belum tersedia.",
          p_recommendation:
            analysis.recommendation || "Belum ada rekomendasi dari AI.",
          p_radius_meters: 50,
        }
      );

      if (submissionError) {
        console.error("Gagal menyimpan/menggabungkan laporan:", submissionError);
        throw new Error(
          `AI berhasil menganalisis, tetapi penyimpanan laporan gagal: ${submissionError.message}`
        );
      }
      if (!submission?.report_id) {
        throw new Error("Database tidak mengembalikan ID laporan utama.");
      }

      setConversation((current) => [...current, userMessage, assistantMessage]);
      setSavedReport({
        id: submission.report_id,
        is_duplicate: Boolean(submission.is_duplicate),
        complaint_count: Number(submission.complaint_count || 1),
        distance_meters: submission.distance_meters ?? null,
        duplicate_check: submission.duplicate_check || "checked",
      });

      const complaintId = submission.complaint_id || null;
      setSavedComplaintId(attachmentFiles.length > 0 ? complaintId : null);
      const uploadToken = submission.attachment_upload_token || null;
      setSavedComplaintUploadToken(attachmentFiles.length > 0 ? uploadToken : null);
      setAttachmentStatus("");

      if (attachmentFiles.length > 0 && complaintId && uploadToken) {
        setAttachmentUpload(true);
        try {
          const uploadedCount = await uploadCitizenAttachments(complaintId, uploadToken, attachmentFiles);
          setAttachmentStatus(uploadedCount + " lampiran berhasil dikirim. Warga dan relawan dapat melihatnya; hanya admin yang dapat mengganti atau menghapus.");
          setAttachmentFiles([]);
          setSavedComplaintId(null);
          setSavedComplaintUploadToken(null);
        } catch (uploadError) {
          console.error("Unggah lampiran laporan gagal:", uploadError);
          setAttachmentStatus(
            "Laporan sudah tersimpan, tetapi lampiran belum terkirim: " +
            (uploadError.message || "unggah gagal. Kamu dapat mencoba lagi.")
          );
        } finally {
          setAttachmentUpload(false);
        }
      } else if (attachmentFiles.length > 0) {
        setAttachmentStatus("Laporan tersimpan, tetapi tiket unggah tidak tersedia. Kamu dapat mengirim ulang laporan tanpa lampiran atau coba lagi.");
      }

      setDescription("");
      setLocation("");
      setCoordinates(null);
      setLocationSource("manual");
      await loadReports();
    } catch (err) {
      console.error("Proses laporan gagal:", err);
      setError(err.message || "Laporan gagal diproses. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const communityPhotos = reports.flatMap((report) => {
    const complaintRows = complaintsByReport[report.id] || [];
    return complaintRows.flatMap((complaint) =>
      (attachmentsByComplaint[complaint.id] || [])
        .filter((attachment) =>
          attachment.content_type?.startsWith("image/") && attachment.signedUrl
        )
        .map((attachment) => ({
          id: attachment.id,
          fileName: attachment.file_name,
          signedUrl: attachment.signedUrl,
          contentType: attachment.content_type,
          latitude: report.latitude,
          longitude: report.longitude,
          category: report.category,
          reportId: report.id,
        }))
    );
  });

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navigasi utama" data-mask-reveal>
        <a className="brand" href="#beranda">
          <span className="brand-mark">T</span>
          <span>TUNTAS</span>
        </a>
        <div className="topbar-links">
          <a href="#beranda">Beranda</a>
          <a href="#laporan">Buat laporan</a>
          <a href="#laporan-warga">Laporan warga</a>
        </div>
        <span className="nav-tag">CIVIC TECH <span aria-hidden="true">/</span> COMMUNITY ACTION</span>
      </nav>

      <section className="hero" id="beranda" data-mask-reveal>
        <div className="eyebrow">
          <span className="pulse" /> COMMUNITY ACTION PLATFORM
        </div>
        <div className="ai-shimmer-badge"><Sparkles size={13} /> TUNTAS AI <span>INTELLIGENCE LAYER</span></div>
        <h1>
          Keluhan warga,
          <br />
          <em>jadi aksi nyata.</em>
        </h1>
        <p className="hero-copy">
          Laporkan masalah di lingkunganmu. AI membantu memahami masalah dan
          menyarankan langkah awal untuk menanganinya.
        </p>
      </section>

      {authReady && <AuthPanel user={user} />}

      <section className="workspace" id="laporan" data-mask-reveal>
        <form className="report-card" onSubmit={submitReport}>
          <div className="section-heading">
            <div>
              <span className="step-label">TUNTAS AI</span>
              <h2>Tanya atau ceritakan sesuatu</h2>
            </div>
            <span className="icon-bubble">
              <Sparkles size={19} />
            </span>
          </div>

          <label htmlFor="location">
            Lokasi kejadian <span>(opsional, diperlukan untuk menyimpan laporan)</span>
          </label>
          <LocationPicker
            location={location}
            coordinates={coordinates}
            onLocationChange={setLocation}
            onCoordinatesChange={setCoordinates}
            onSourceChange={setLocationSource}
            onResolvingChange={setLocationResolving}
            onError={setError}
            reports={reports}
            communityPhotos={communityPhotos}
            disabled={loading}
          />

          <label htmlFor="description">Pesan untuk TUNTAS AI</label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tanyakan apa saja, ceritakan sesuatu, minta bantuan, atau laporkan masalah di sekitarmu..."
            rows={5}
            maxLength={1500}
            minLength={1}
            required
          />
          <div className="input-meta">
            <span>{description.length}/1500 karakter</span>
            <span>Jangan sertakan data pribadi.</span>
          </div>

          <div className="citizen-attachment">
            <div className="citizen-attachment-heading">
              <div>
                <label htmlFor="citizen-attachments">
                  <Paperclip size={15} /> Bukti pendukung <span>(opsional)</span>
                </label>
                <p>Pratinjau foto dan video sebelum laporan dikirim. Maksimal 10 file.</p>
              </div>
              <span className="attachment-counter">{attachmentFiles.length}/10</span>
            </div>
            <input
              id="citizen-attachments"
              className="citizen-attachment-input"
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.rar,.txt,.csv,.rtf,.bin"
              onChange={selectAttachmentFiles}
              disabled={loading || attachmentUpload}
            />
            <div className="attachment-rules">
              <span>Foto, video, audio</span>
              <span>PDF & dokumen Office</span>
              <span>ZIP & file pendukung</span>
              <span>Tidak ada batas ukuran buatan aplikasi</span>
            </div>
            {attachmentPreviews.length > 0 && (
              <div className="attachment-preview-grid">
                {attachmentPreviews.map((preview, index) => (
                  <article className="attachment-preview-card" key={preview.file.name + "-" + preview.file.lastModified + "-" + index}>
                    {preview.kind === "image" ? (
                      <img src={preview.url} alt={"Pratinjau " + preview.file.name} />
                    ) : preview.kind === "video" ? (
                      <video src={preview.url} controls preload="metadata" />
                    ) : preview.kind === "audio" ? (
                      <div className="attachment-preview-audio"><FileVideo size={22} /><audio src={preview.url} controls /></div>
                    ) : (
                      <div className="attachment-preview-document"><FileText size={26} /><span>Dokumen pendukung</span></div>
                    )}
                    <div className="attachment-preview-meta">
                      <strong title={preview.file.name}>{preview.file.name}</strong>
                      <small>{attachmentLabel(getAttachmentType(preview.file) || "")} · {formatFileSize(preview.file.size)}</small>
                    </div>
                    <button
                      type="button"
                      aria-label={"Hapus " + preview.file.name}
                      title="Hapus lampiran"
                      onClick={() => setAttachmentFiles((current) => current.filter((_, i) => i !== index))}
                      disabled={loading || attachmentUpload}
                    >
                      <X size={15} />
                    </button>
                  </article>
                ))}
              </div>
            )}
            {uploadProgress && <p className="attachment-upload-progress" role="status">{uploadProgress}</p>}
          </div>

          {error && (
            <div className="error-box" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
            </div>
          )}

          <button className="submit-button" disabled={loading || locationResolving}>
            {loading ? (
              <>
                <span className="spinner" /> TUNTAS AI sedang menjawab...
              </>
            ) : (
              <>
                <Sparkles size={18} /> Kirim ke TUNTAS AI <Send size={16} />
              </>
            )}
          </button>
          <p className="privacy-note">
            <ShieldCheck size={15} /> Analisis AI adalah rekomendasi awal dan
            perlu diverifikasi manusia.
          </p>
        </form>

        <aside className="result-panel">
          <div className="result-top">
            <span className="step-label">LANGKAH 02</span>
            <span className="ai-chip">
              <Sparkles size={13} /> GEMINI AI
            </span>
          </div>
          <h2>Percakapan dengan AI</h2>
          {conversation.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Sparkles size={25} />
              </div>
              <h3>Mulai percakapan</h3>
              <p>
                Tanyakan apa saja atau ceritakan masalah. TUNTAS AI akan
                memahami konteks dan membantu sesuai kebutuhanmu.
              </p>
            </div>
          ) : (
            <div className="conversation-thread">
              {conversation.map((message, index) => (
                <article className={`chat-message chat-message-${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === "assistant" ? "TUNTAS AI" : "KAMU"}</span>
                  <p>{message.content}</p>
                </article>
              ))}
              {result?.kind === "report" && (
              <div className="analysis-result">
              <div className="success-line">
                <CheckCircle2 size={17} /> Analisis AI selesai
              </div>
              <div className="result-field">
                <span>KATEGORI</span>
                <strong>{result.category}</strong>
              </div>
              <div className="result-field">
                <span>TINGKAT PRIORITAS</span>
                <strong className={`priority ${priorityClass(result.priority)}`}>
                  {result.priority}
                </strong>
              </div>
              <div className="result-field">
                <span>RINGKASAN</span>
                <p>{result.summary}</p>
              </div>
              <div className="recommendation">
                <span>REKOMENDASI AI</span>
                <p>{result.recommendation}</p>
              </div>
              {locationContext && (
                <div className={`map-context map-context-${locationContext.status || "unavailable"}`}>
                  <div className="map-context-heading">
                    <MapPin size={15} />
                    <strong>{mapContextLabel(locationContext.status)}</strong>
                  </div>
                  {locationContext.formatted_address && <p>{locationContext.formatted_address}</p>}
                  {locationContext.administrative_area && <small>{locationContext.administrative_area}</small>}
                  {locationContext.result_type && <small>Tingkat hasil peta: {locationContext.result_type}</small>}
                  {Number.isFinite(locationContext.confidence) && (
                    <small>Kecocokan alamat peta: {Math.round(locationContext.confidence * 100)}%</small>
                  )}
                  {locationContext.nearby_places?.length > 0 && (
                    <div className="nearby-places">
                      <small>Tempat yang tercatat pada peta dalam radius 500 meter</small>
                      <ul>
                        {locationContext.nearby_places.map((place, index) => (
                          <li key={`${place.name}-${index}`}>
                            <span>{place.name}</span>
                            {Number.isFinite(place.distance_meters) && <small>{Math.round(place.distance_meters)} m</small>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <small className="map-context-note">Data peta memeriksa konteks alamat, bukan membuktikan kondisi di lapangan.</small>
                </div>
              )}
              {savedReport && (
                <div className="saved-notice">
                  <CheckCircle2 size={16} />
                  <span>
                    {savedReport.is_duplicate
                      ? "Keluhan berhasil digabungkan ke laporan utama yang sudah ada."
                      : "Laporan utama baru berhasil dibuat."}
                  </span>
                  <small>
                    ID laporan utama: {savedReport.id}
                    <br />Jumlah keluhan dalam laporan: {savedReport.complaint_count}
                    {savedReport.is_duplicate && savedReport.distance_meters !== null
                      ? ` · Jarak dari laporan utama: ${Number(savedReport.distance_meters).toFixed(1)} meter`
                      : ""}
                    {savedReport.duplicate_check === "skipped_no_gps"
                      ? " · Deteksi duplikat dilewati karena GPS tidak tersedia."
                      : ""}
                  </small>
                </div>
              )}
              {attachmentStatus && (
                <div className="attachment-feedback" role="status">
                  <Paperclip size={16} />
                  <span>{attachmentStatus}</span>
                  {savedComplaintId && savedComplaintUploadToken && attachmentFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={retryCitizenAttachments}
                      disabled={attachmentUpload || loading}
                    >
                      {attachmentUpload ? "Mengunggah..." : "Coba unggah lagi"}
                    </button>
                  )}
                </div>
              )}
              <p className="human-check">
                Prioritas bukan keputusan resmi. Petugas atau pengelola
                lingkungan harus memeriksa kondisi sebenarnya.
              </p>
            </div>
          )}
            </div>
          )}
        </aside>
      </section>

      {authReady && user && <VolunteerCenter user={user} />}

      <section className="reports-section" id="laporan-warga" aria-labelledby="reports-title" data-mask-reveal>
        <div className="reports-heading">
          <div>
            <span className="step-label">LANGKAH 03</span>
            <h2 id="reports-title">Laporan warga terbaru</h2>
            <p>
              Satu kartu mewakili satu masalah. Keluhan serupa di lokasi berdekatan
              masuk ke laporan utama tanpa menghapus keluhan warga.
            </p>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={loadReports}
            disabled={reportsLoading}
          >
            <RefreshCw size={15} className={reportsLoading ? "spin-icon" : ""} />
            Muat ulang
          </button>
        </div>

        {reportsError && (
          <div className="error-box" role="alert">
            <AlertTriangle size={17} />
            <span>{reportsError}</span>
          </div>
        )}
        {adminActionMessage && <p className="admin-action-message" role="status">{adminActionMessage}</p>}
        {uploadProgress && <p className="attachment-upload-progress" role="status">{uploadProgress}</p>}

        {reportsLoading && reports.length === 0 ? (
          <div className="reports-empty">Memuat laporan...</div>
        ) : reports.length === 0 ? (
          <div className="reports-empty">
            <Database size={22} />
            <strong>{reportsError ? "Laporan belum dapat dimuat." : "Belum ada laporan tersimpan."}</strong>
            <span>{reportsError ? "Periksa koneksi internet lalu tekan Muat ulang." : "Laporan yang berhasil dikirim akan muncul di sini."}</span>
          </div>
        ) : (
          <div className="report-list">
            {reports.map((report) => (
              <article className="report-item" data-mask-reveal key={report.id}>
                <div className="report-item-top">
                  <span className="report-category">
                    {report.category || "Belum dikategorikan"}
                  </span>
                  <span className={`priority ${priorityClass(report.priority)}`}>
                    {report.priority || "Prioritas belum tersedia"}
                  </span>
                </div>
                <h3>{report.description}</h3>
                <p className="report-location">
                  <MapPin size={14} /> {report.location || "Lokasi tidak tersedia"}
                </p>
                {report.summary && <p className="report-summary">{report.summary}</p>}
                {isAdmin && (
                  <div className="report-admin-edit">
                    {editingReportId !== report.id ? (
                      <button type="button" className="admin-edit-button" onClick={() => beginReportEdit(report)}>
                        Edit laporan
                      </button>
                    ) : (
                      <form className="report-edit-form" onSubmit={(event) => { event.preventDefault(); saveReportEdit(report.id); }}>
                        <label>Deskripsi laporan
                          <textarea rows={3} maxLength={1500} value={reportEditFields.description || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, description: event.target.value }))} />
                        </label>
                        <label>Lokasi
                          <input maxLength={200} value={reportEditFields.location || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, location: event.target.value }))} />
                        </label>
                        <div className="report-edit-two-cols">
                          <label>Kategori
                            <input maxLength={80} value={reportEditFields.category || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, category: event.target.value }))} />
                          </label>
                          <label>Penilaian prioritas
                            <input maxLength={100} value={reportEditFields.priority || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, priority: event.target.value }))} />
                          </label>
                        </div>
                        <label>Ringkasan
                          <textarea rows={2} maxLength={4000} value={reportEditFields.summary || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, summary: event.target.value }))} />
                        </label>
                        <label>Rekomendasi
                          <textarea rows={2} maxLength={4000} value={reportEditFields.recommendation || ""} onChange={(event) => setReportEditFields((current) => ({ ...current, recommendation: event.target.value }))} />
                        </label>
                        <div className="assignment-actions">
                          <button type="submit" className="volunteer-primary" disabled={savingReportEdit}>{savingReportEdit ? "Menyimpan..." : "Simpan perubahan"}</button>
                          <button type="button" className="volunteer-secondary" disabled={savingReportEdit} onClick={() => setEditingReportId(null)}>Batal</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
                {(() => {
                  const complaintList = complaintsByReport[report.id] || [];
                  const complaintCount = Math.max(1, complaintList.length);
                  return (
                    <div className="complaint-group">
                      <div className="complaint-count">
                        <Users size={14} /> {complaintCount} keluhan warga
                      </div>
                      {complaintCount > 1 && (
                        <details className="complaint-details">
                          <summary>Lihat semua keluhan</summary>
                          <ol>
                            {complaintList.map((complaint) => (
                              <li key={complaint.id}>
                                <p>{complaint.description}</p>
                                <small>
                                  {complaint.is_initial ? "Keluhan awal" : "Keluhan tambahan"}
                                  {" · "}{formatDate(complaint.created_at)}
                                  {complaint.location ? ` · ${complaint.location}` : ""}
                                </small>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </div>
                  );
                })()}
                {(complaintsByReport[report.id] || []).some((complaint) => (attachmentsByComplaint[complaint.id] || []).length > 0) && (
                  <div className="report-attachments">
                    <strong><Paperclip size={14} /> Bukti pendukung warga</strong>
                    {(complaintsByReport[report.id] || []).map((complaint) => {
                      const complaintAttachments = attachmentsByComplaint[complaint.id] || [];
                      if (!complaintAttachments.length) return null;
                      return (
                        <div className="report-attachment-group" key={complaint.id}>
                          <small>{complaint.is_initial ? "Keluhan awal" : "Keluhan tambahan"} · {formatDate(complaint.created_at)}</small>
                          <div className="report-attachment-list">
                            {complaintAttachments.map((item) => (
                              <div className="report-attachment-item" key={item.id}>
                                {item.signedUrl && item.content_type.startsWith("image/") ? (
                                  <a href={item.signedUrl} target="_blank" rel="noreferrer">
                                    <img src={item.signedUrl} alt={"Lampiran " + item.file_name} loading="lazy" />
                                  </a>
                                ) : item.signedUrl && item.content_type.startsWith("video/") ? (
                                  <video controls preload="metadata">
                                    <source src={item.signedUrl} type={item.content_type} />
                                    Browser tidak mendukung video ini.
                                  </video>
                                ) : item.signedUrl && item.content_type.startsWith("audio/") ? (
                                  <div className="report-attachment-audio"><FileVideo size={18} /><audio controls preload="none" src={item.signedUrl} /></div>
                                ) : (
                                  <span className="attachment-file-icon"><FileText size={18} /></span>
                                )}
                                <div className="report-attachment-details">
                                  <strong>{item.file_name}</strong>
                                  <small>{formatFileSize(Number(item.size_bytes))} · {attachmentLabel(item.content_type)}</small>
                                  {item.signedUrl && (
                                    <a href={item.signedUrl} target="_blank" rel="noreferrer" download={item.file_name}>
                                      {item.content_type === "application/pdf" ? "Buka PDF" : "Unduh file"}
                                    </a>
                                  )}
                                  {!item.signedUrl && <small>Tautan sementara tidak tersedia. Segarkan laporan.</small>}
                                  {isAdmin && (
                                    <div className="report-attachment-admin-actions">
                                      <label className="admin-file-replace">
                                        Ganti file
                                        <input
                                          type="file"
                                          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.rar,.txt,.csv,.rtf,.bin"
                                          disabled={Boolean(adminFileBusy)}
                                          onChange={(event) => {
                                            const nextFile = event.currentTarget.files?.[0];
                                            event.currentTarget.value = "";
                                            if (nextFile) replaceAttachmentAsAdmin(item, nextFile);
                                          }}
                                        />
                                      </label>
                                      <button type="button" className="admin-file-delete" disabled={Boolean(adminFileBusy)} onClick={() => deleteAttachmentAsAdmin(item)}>
                                        {adminFileBusy === item.id ? "Memproses..." : "Hapus"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="report-item-bottom">
                  <span className="report-status">{report.status || "Status belum ditentukan"}</span>
                  <span>
                    <Clock3 size={13} /> {formatDate(report.created_at)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>TUNTAS © 2026</span>
        <span>Teknologi untuk lingkungan yang lebih baik.</span>
      </footer>
    </main>
  );
}
