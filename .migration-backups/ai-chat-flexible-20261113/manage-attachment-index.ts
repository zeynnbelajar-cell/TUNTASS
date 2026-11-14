import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "citizen-report-attachments";
const MAX_REQUEST_BYTES = 32 * 1024;
const VIEW_URL_SECONDS = 3600;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif",
  "video/mp4", "video/webm", "video/quicktime", "video/mpeg", "video/ogg",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed", "application/octet-stream",
  "text/plain", "text/csv", "text/rtf",
]);
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "video/mpeg": "mpeg", "video/ogg": "ogv",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
  "audio/ogg": "ogg", "audio/webm": "weba",
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip", "application/x-zip-compressed": "zip",
  "application/octet-stream": "bin", "text/plain": "txt", "text/csv": "csv", "text/rtf": "rtf",
};
const ALLOWED_CATEGORIES = new Set([
  "Sampah", "Jalan Rusak", "Drainase Tersumbat", "Lampu Jalan",
  "Banjir", "Fasilitas Umum", "Lainnya",
]);
const ALLOWED_PRIORITIES = new Set(["Rendah", "Sedang", "Tinggi"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  let secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secretKey && secretMap) {
    try {
      const parsed = JSON.parse(secretMap);
      secretKey = parsed.default || Object.values(parsed)[0] as string;
    } catch {
      throw new Error("Konfigurasi secret Supabase tidak valid.");
    }
  }
  if (!url || !secretKey) throw new Error("Konfigurasi server Supabase belum lengkap.");
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getPublishableKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const publishableMap = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!publishableMap) return null;
  try {
    const parsed = JSON.parse(publishableMap);
    return parsed.default || Object.values(parsed)[0] as string;
  } catch {
    return null;
  }
}

async function requireAdmin(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  if (!token || !url || !publishableKey) return null;

  const userClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user || data.user.app_metadata?.tuntas_role !== "admin") return null;
  return { id: data.user.id };
}

function safeFileName(value: unknown): string {
  const raw = typeof value === "string" ? value : "lampiran";
  const lastSegment = raw.split(/[\\\\/]/).pop() || "lampiran";
  const cleaned = lastSegment.normalize("NFKC")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 150)
    .trim();
  return cleaned || "lampiran";
}

function getFileMetadata(body: Record<string, unknown>) {
  const contentType = typeof body.content_type === "string"
    ? body.content_type.toLowerCase().trim()
    : "application/octet-stream";
  const sizeBytes = Number(body.size_bytes);
  const fileName = safeFileName(body.file_name);

  if (!ALLOWED_TYPES.has(contentType)) {
    return { error: "Jenis file ini belum didukung. Gunakan gambar, video, audio, PDF, dokumen, atau arsip umum." };
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    return { error: "Informasi ukuran file tidak valid." };
  }
  return { contentType, sizeBytes, fileName };
}

function getIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

async function ipDigest(ip: string): Promise<string> {
  const secretMap = Deno.env.get("SUPABASE_SECRET_KEYS")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secretMap), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cleanupExpiredReservations(
  admin: ReturnType<typeof getAdminClient>,
  complaintId: string,
) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: expired, error } = await admin.from("complaint_attachments")
    .select("id, storage_path")
    .eq("complaint_id", complaintId)
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(20);
  if (error || !expired?.length) return;
  await admin.storage.from(BUCKET).remove(expired.map((item) => item.storage_path));
  await admin.from("complaint_attachments").delete().in("id", expired.map((item) => item.id));
}

async function validateUploadTicket(
  admin: ReturnType<typeof getAdminClient>,
  complaintId: string,
  uploadToken: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(uploadToken)) return false;
  const { data, error } = await admin.from("complaint_attachment_upload_tickets")
    .select("complaint_id")
    .eq("complaint_id", complaintId)
    .eq("upload_token", uploadToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error("Upload ticket lookup failed", error.message);
    return false;
  }
  return Boolean(data);
}

async function createUpload(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const complaintId = typeof body.complaint_id === "string" ? body.complaint_id : "";
  const uploadToken = typeof body.upload_token === "string" ? body.upload_token : "";
  const metadata = getFileMetadata(body);
  if (!UUID_PATTERN.test(complaintId)) return jsonResponse({ error: "ID keluhan tidak valid." }, 400);
  if ("error" in metadata) return jsonResponse({ error: metadata.error }, 415);
  if (!await validateUploadTicket(admin, complaintId, uploadToken)) {
    return jsonResponse({ error: "Izin lampiran tidak valid atau sudah kedaluwarsa." }, 403);
  }

  const { data: complaint, error: complaintError } = await admin.from("report_complaints")
    .select("id, created_at")
    .eq("id", complaintId)
    .maybeSingle();
  if (complaintError) {
    console.error("Complaint lookup failed", complaintError.message);
    return jsonResponse({ error: "Keluhan tidak dapat diperiksa. Coba lagi." }, 500);
  }
  if (!complaint) return jsonResponse({ error: "Keluhan tidak ditemukan." }, 404);
  const ageMs = Date.now() - new Date(complaint.created_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
    return jsonResponse({ error: "Waktu unggah laporan sudah berakhir." }, 410);
  }

  await cleanupExpiredReservations(admin, complaintId);
  const ipHash = await ipDigest(getIp(req));
  const storagePath = complaintId + "/" + crypto.randomUUID() + "." +
    (EXTENSIONS[metadata.contentType] || "bin");
  const { data: reservation, error: insertError } = await admin.from("complaint_attachments")
    .insert({
      complaint_id: complaintId,
      storage_path: storagePath,
      file_name: metadata.fileName,
      content_type: metadata.contentType,
      size_bytes: metadata.sizeBytes,
      ip_hash: ipHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    const message = insertError.message || "";
    if (message.includes("Maksimal 10 lampiran")) return jsonResponse({ error: message }, 409);
    if (message.includes("Batas pembuatan tautan")) return jsonResponse({ error: message }, 429);
    console.error("Attachment reservation failed", message);
    return jsonResponse({ error: "Lampiran belum dapat disiapkan. Coba lagi." }, 500);
  }

  const { data: signedUpload, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError || !signedUpload?.token) {
    await admin.from("complaint_attachments").delete().eq("id", reservation.id);
    console.error("Signed upload creation failed", signedError?.message);
    return jsonResponse({ error: "Tautan unggah gagal dibuat. Coba lagi." }, 503);
  }
  return jsonResponse({
    attachment_id: reservation.id,
    path: storagePath,
    token: signedUpload.token,
    expires_in_seconds: 7200,
  });
}

async function findUploadedObject(
  admin: ReturnType<typeof getAdminClient>,
  storagePath: string,
  expectedSize: number,
  expectedType: string,
) {
  const pieces = storagePath.split("/");
  const folder = pieces.slice(0, -1).join("/");
  const fileName = pieces[pieces.length - 1];
  const { data: objects, error } = await admin.storage.from(BUCKET)
    .list(folder, { limit: 100, search: fileName });
  if (error) {
    console.error("Uploaded object lookup failed", error.message);
    return { error: "File belum dapat diverifikasi di penyimpanan.", status: 503 };
  }
  const object = (objects || []).find((item) => item.name === fileName && item.id !== null);
  if (!object) return { error: "File belum ditemukan. Pastikan proses unggah selesai.", status: 409 };

  const actualSize = Number(object.metadata?.size);
  const actualType = String(object.metadata?.mimetype || object.metadata?.contentType || "");
  if (!Number.isSafeInteger(actualSize) || actualSize !== expectedSize) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { error: "Ukuran file tidak sesuai dengan informasi awal.", status: 422 };
  }
  if (actualType && actualType !== expectedType) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { error: "Jenis file tidak sesuai dengan informasi awal.", status: 415 };
  }
  return { object };
}

async function completeUpload(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
) {
  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  const uploadToken = typeof body.upload_token === "string" ? body.upload_token : "";
  if (!UUID_PATTERN.test(attachmentId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);

  const { data: attachment, error } = await admin.from("complaint_attachments")
    .select("id, complaint_id, storage_path, content_type, size_bytes, status, created_at, replacement_for")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) {
    console.error("Attachment lookup failed", error.message);
    return jsonResponse({ error: "Lampiran tidak dapat diperiksa." }, 500);
  }
  if (!attachment) return jsonResponse({ error: "Reservasi lampiran tidak ditemukan." }, 404);
  if (attachment.replacement_for) {
    return jsonResponse({ error: "Penggantian file harus diselesaikan melalui proses admin." }, 403);
  }
  if (!await validateUploadTicket(admin, attachment.complaint_id, uploadToken)) {
    return jsonResponse({ error: "Izin lampiran tidak valid atau sudah kedaluwarsa." }, 403);
  }
  if (attachment.status === "uploaded") {
    return jsonResponse({ attachment_id: attachment.id, status: "uploaded" });
  }

  const ageMs = Date.now() - new Date(attachment.created_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
    return jsonResponse({ error: "Waktu unggah sudah berakhir. Kirim ulang lampiran dari laporan." }, 410);
  }
  const verified = await findUploadedObject(
    admin, attachment.storage_path, Number(attachment.size_bytes), attachment.content_type,
  );
  if ("error" in verified) return jsonResponse({ error: verified.error }, verified.status);

  const { error: updateError } = await admin.from("complaint_attachments")
    .update({ status: "uploaded", uploaded_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .eq("status", "pending");
  if (updateError) {
    console.error("Attachment completion failed", updateError.message);
    return jsonResponse({ error: "File tersimpan, tetapi status lampiran belum berhasil diperbarui." }, 500);
  }
  return jsonResponse({
    attachment_id: attachment.id,
    complaint_id: attachment.complaint_id,
    status: "uploaded",
  });
}

async function abortUpload(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
) {
  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  const uploadToken = typeof body.upload_token === "string" ? body.upload_token : "";
  if (!UUID_PATTERN.test(attachmentId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);

  const { data, error } = await admin.from("complaint_attachments")
    .select("id, complaint_id, storage_path, created_at, replacement_for")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) return jsonResponse({ error: "Reservasi lampiran tidak dapat diperiksa." }, 500);
  if (!data) return jsonResponse({ attachment_id: attachmentId, status: "already_removed" });
  if (data.replacement_for) return jsonResponse({ error: "Reservasi ini milik proses penggantian admin." }, 403);
  if (!await validateUploadTicket(admin, data.complaint_id, uploadToken)) {
    return jsonResponse({ error: "Izin lampiran tidak valid atau sudah kedaluwarsa." }, 403);
  }
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
    return jsonResponse({ error: "Reservasi lampiran sudah melewati waktu pemulihan." }, 410);
  }
  if (data.status === "uploaded") {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([data.storage_path]);
    if (removeError) return jsonResponse({ error: "File gagal dibersihkan dari penyimpanan." }, 503);
  }
  const { error: deleteError } = await admin.from("complaint_attachments").delete().eq("id", attachmentId);
  if (deleteError) return jsonResponse({ error: "Reservasi lampiran gagal dibersihkan." }, 500);
  return jsonResponse({ attachment_id: attachmentId, status: "aborted" });
}

async function viewManyAttachments(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
) {
  const rawIds = Array.isArray(body.attachment_ids) ? body.attachment_ids : [];
  const ids = [...new Set(rawIds.filter((item): item is string =>
    typeof item === "string" && UUID_PATTERN.test(item)))];
  if (ids.length > 200) return jsonResponse({ error: "Terlalu banyak lampiran dalam satu permintaan." }, 413);
  if (!ids.length) return jsonResponse({ attachments: [] });

  const { data, error } = await admin.from("complaint_attachments")
    .select("id, complaint_id, file_name, content_type, size_bytes, uploaded_at, storage_path")
    .in("id", ids)
    .eq("status", "uploaded");
  if (error) {
    console.error("Public attachment lookup failed", error.message);
    return jsonResponse({ error: "Lampiran tidak dapat dimuat." }, 500);
  }

  const result: Array<Record<string, unknown>> = [];
  const rows = data || [];
  for (let index = 0; index < rows.length; index += 20) {
    const batch = rows.slice(index, index + 20);
    const signed = await Promise.all(batch.map(async (item) => {
      const { data: urlData, error: signError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(item.storage_path, VIEW_URL_SECONDS);
      return {
        id: item.id,
        complaint_id: item.complaint_id,
        file_name: item.file_name,
        content_type: item.content_type,
        size_bytes: Number(item.size_bytes),
        uploaded_at: item.uploaded_at,
        signed_url: signError ? null : urlData?.signedUrl || null,
      };
    }));
    result.push(...signed);
  }
  return jsonResponse({ attachments: result });
}

async function adminPrepareReplace(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const user = await requireAdmin(req);
  if (!user) return jsonResponse({ error: "Hanya admin yang dapat mengganti lampiran." }, 403);

  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  const metadata = getFileMetadata(body);
  if (!UUID_PATTERN.test(attachmentId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);
  if ("error" in metadata) return jsonResponse({ error: metadata.error }, 415);

  const { data: current, error: currentError } = await admin.from("complaint_attachments")
    .select("id, complaint_id, status")
    .eq("id", attachmentId)
    .maybeSingle();
  if (currentError) return jsonResponse({ error: "Lampiran tidak dapat diperiksa." }, 500);
  if (!current || current.status !== "uploaded") return jsonResponse({ error: "Lampiran yang akan diganti tidak tersedia." }, 404);

  const storagePath = current.complaint_id + "/" + crypto.randomUUID() + "." +
    (EXTENSIONS[metadata.contentType] || "bin");
  const { data: staging, error: insertError } = await admin.from("complaint_attachments")
    .insert({
      complaint_id: current.complaint_id,
      storage_path: storagePath,
      file_name: metadata.fileName,
      content_type: metadata.contentType,
      size_bytes: metadata.sizeBytes,
      replacement_for: current.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("Admin replacement reservation failed", insertError.message);
    if (insertError.code === "23505") return jsonResponse({ error: "Penggantian lampiran ini sedang berlangsung." }, 409);
    return jsonResponse({ error: "Penggantian lampiran tidak dapat disiapkan." }, 500);
  }

  const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (signedError || !signed?.token) {
    await admin.from("complaint_attachments").delete().eq("id", staging.id);
    return jsonResponse({ error: "Izin unggah pengganti gagal dibuat." }, 503);
  }
  return jsonResponse({
    attachment_id: staging.id,
    path: storagePath,
    token: signed.token,
    expires_in_seconds: 7200,
  });
}

async function adminCompleteReplace(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const user = await requireAdmin(req);
  if (!user) return jsonResponse({ error: "Hanya admin yang dapat menyelesaikan penggantian lampiran." }, 403);
  const stagingId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  if (!UUID_PATTERN.test(stagingId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);

  const { data: staging, error } = await admin.from("complaint_attachments")
    .select("id, complaint_id, storage_path, file_name, content_type, size_bytes, status, created_at, replacement_for")
    .eq("id", stagingId)
    .maybeSingle();
  if (error) return jsonResponse({ error: "Data penggantian tidak dapat diperiksa." }, 500);
  if (!staging || !staging.replacement_for || staging.status !== "pending") {
    return jsonResponse({ error: "Proses penggantian tidak ditemukan atau sudah selesai." }, 404);
  }
  const ageMs = Date.now() - new Date(staging.created_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
    return jsonResponse({ error: "Sesi penggantian sudah berakhir." }, 410);
  }

  const verified = await findUploadedObject(
    admin, staging.storage_path, Number(staging.size_bytes), staging.content_type,
  );
  if ("error" in verified) return jsonResponse({ error: verified.error }, verified.status);

  const { data: existing, error: existingError } = await admin.from("complaint_attachments")
    .select("id, storage_path")
    .eq("id", staging.replacement_for)
    .eq("status", "uploaded")
    .maybeSingle();
  if (existingError) return jsonResponse({ error: "File lama tidak dapat diperiksa." }, 500);
  if (!existing) return jsonResponse({ error: "File lama tidak tersedia untuk diganti." }, 404);

  const { error: updateError } = await admin.from("complaint_attachments")
    .update({
      storage_path: staging.storage_path,
      file_name: staging.file_name,
      content_type: staging.content_type,
      size_bytes: staging.size_bytes,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", existing.id)
    .eq("status", "uploaded");
  if (updateError) {
    console.error("Admin replacement update failed", updateError.message);
    return jsonResponse({ error: "Lampiran lama gagal diperbarui." }, 500);
  }

  await admin.from("complaint_attachments").delete().eq("id", staging.id);
  const { error: removeOldError } = await admin.storage.from(BUCKET).remove([existing.storage_path]);
  if (removeOldError) console.warn("Old replaced file cleanup failed", removeOldError.message);
  return jsonResponse({ attachment_id: existing.id, status: "replaced" });
}

async function adminAbortReplace(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const user = await requireAdmin(req);
  if (!user) return jsonResponse({ error: "Hanya admin yang dapat membatalkan penggantian." }, 403);
  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  if (!UUID_PATTERN.test(attachmentId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);
  const { data, error } = await admin.from("complaint_attachments")
    .select("id, storage_path, replacement_for")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) return jsonResponse({ error: "Data penggantian tidak dapat diperiksa." }, 500);
  if (!data || !data.replacement_for) return jsonResponse({ attachment_id: attachmentId, status: "already_removed" });
  const { error: removeError } = await admin.storage.from(BUCKET).remove([data.storage_path]);
  if (removeError) return jsonResponse({ error: "File sementara gagal dibersihkan." }, 503);
  const { error: deleteError } = await admin.from("complaint_attachments").delete().eq("id", attachmentId);
  if (deleteError) return jsonResponse({ error: "Reservasi penggantian gagal dibersihkan." }, 500);
  return jsonResponse({ attachment_id: attachmentId, status: "aborted" });
}

async function adminDeleteAttachment(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const user = await requireAdmin(req);
  if (!user) return jsonResponse({ error: "Hanya admin yang dapat menghapus lampiran." }, 403);
  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
  if (!UUID_PATTERN.test(attachmentId)) return jsonResponse({ error: "ID lampiran tidak valid." }, 400);
  const { data, error } = await admin.from("complaint_attachments")
    .select("id, storage_path, status, replacement_for")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) return jsonResponse({ error: "Lampiran tidak dapat diperiksa." }, 500);
  if (!data || data.replacement_for) return jsonResponse({ error: "Lampiran tidak ditemukan." }, 404);
  const { error: storageError } = await admin.storage.from(BUCKET).remove([data.storage_path]);
  if (storageError) {
    console.error("Storage delete failed", storageError.message);
    return jsonResponse({ error: "File gagal dihapus dari penyimpanan." }, 503);
  }
  const { error: deleteError } = await admin.from("complaint_attachments").delete().eq("id", attachmentId);
  if (deleteError) return jsonResponse({ error: "File sudah dihapus, tetapi catatan lampiran belum berhasil dihapus." }, 500);
  return jsonResponse({ attachment_id: attachmentId, status: "deleted", deleted_by: user.id });
}

async function adminUpdateReport(
  admin: ReturnType<typeof getAdminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const user = await requireAdmin(req);
  if (!user) return jsonResponse({ error: "Hanya admin yang dapat mengedit laporan." }, 403);
  const reportId = typeof body.report_id === "string" ? body.report_id : "";
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
    ? body.fields as Record<string, unknown>
    : null;
  if (!UUID_PATTERN.test(reportId) || !fields) return jsonResponse({ error: "Data laporan tidak valid." }, 400);

  const updates: Record<string, string | null> = {};
  const textFields = ["description", "location", "summary", "recommendation"] as const;
  for (const key of textFields) {
    if (!(key in fields)) continue;
    if (fields[key] !== null && typeof fields[key] !== "string") {
      return jsonResponse({ error: "Field laporan tidak valid: " + key }, 400);
    }
    const value = typeof fields[key] === "string" ? fields[key].trim() : "";
    const max = key === "description" ? 1500 : key === "location" ? 200 : 4000;
    const min = key === "description" ? 15 : key === "location" ? 1 : 0;
    if (value.length < min || value.length > max) {
      return jsonResponse({ error: "Panjang field " + key + " tidak valid." }, 400);
    }
    updates[key] = value || null;
  }
  if ("category" in fields) {
    if (typeof fields.category !== "string" || !ALLOWED_CATEGORIES.has(fields.category)) {
      return jsonResponse({ error: "Kategori laporan tidak valid." }, 400);
    }
    updates.category = fields.category;
  }
  if ("priority" in fields) {
    if (typeof fields.priority !== "string" || !ALLOWED_PRIORITIES.has(fields.priority)) {
      return jsonResponse({ error: "Prioritas laporan tidak valid." }, 400);
    }
    updates.priority = fields.priority;
  }
  if (!Object.keys(updates).length) return jsonResponse({ error: "Tidak ada perubahan laporan." }, 400);
  updates.updated_at = new Date().toISOString();
  updates.updated_by = user.id;

  const { data, error } = await admin.from("reports")
    .update(updates)
    .eq("id", reportId)
    .select("id, description, location, category, priority, summary, recommendation, updated_at")
    .maybeSingle();
  if (error) {
    console.error("Admin report update failed", error.message);
    return jsonResponse({ error: "Perubahan laporan gagal disimpan." }, 500);
  }
  if (!data) return jsonResponse({ error: "Laporan tidak ditemukan." }, 404);
  return jsonResponse({ report: data, status: "updated" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return jsonResponse({ error: "Permintaan terlalu besar." }, 413);

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Format permintaan tidak valid." }, 400);
    }
    const action = body.action;
    const admin = getAdminClient();

    switch (action) {
      case "create":
        return await createUpload(admin, body, req);
      case "complete":
        return await completeUpload(admin, body);
      case "abort":
        return await abortUpload(admin, body);
      case "view_many":
        return await viewManyAttachments(admin, body);
      case "admin_prepare_replace":
        return await adminPrepareReplace(admin, body, req);
      case "admin_complete_replace":
        return await adminCompleteReplace(admin, body, req);
      case "admin_abort_replace":
        return await adminAbortReplace(admin, body, req);
      case "admin_delete_attachment":
        return await adminDeleteAttachment(admin, body, req);
      case "admin_update_report":
        return await adminUpdateReport(admin, body, req);
      default:
        return jsonResponse({ error: "Aksi tidak dikenal." }, 400);
    }
  } catch (error) {
    console.error("Attachment function failure", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ error: "Lampiran gagal diproses. Coba kembali." }, 500);
  }
});
