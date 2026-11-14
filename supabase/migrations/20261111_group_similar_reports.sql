-- TUNTAS: laporan utama + kumpulan keluhan warga
-- Aman dijalankan setelah tabel public.reports tersedia.
-- Kolom koordinat dibuat bila belum ada (tabel reports lama tetap dipertahankan).
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
-- Deteksi otomatis hanya memakai kategori yang sama dan GPS dalam radius 50 meter.

CREATE TABLE IF NOT EXISTS public.report_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  category TEXT,
  priority TEXT,
  summary TEXT,
  recommendation TEXT,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

-- Memastikan tabel yang mungkin sudah pernah dibuat memiliki kolom yang diperlukan.
ALTER TABLE public.report_complaints
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS recommendation TEXT,
  ADD COLUMN IF NOT EXISTS is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS report_complaints_report_id_idx
  ON public.report_complaints(report_id);

CREATE INDEX IF NOT EXISTS reports_category_location_idx
  ON public.reports(category, latitude, longitude);

-- Migrasikan setiap laporan yang sudah ada menjadi keluhan awal,
-- tanpa menghapus atau mengubah baris pada tabel reports.
INSERT INTO public.report_complaints (
  report_id, description, location, latitude, longitude,
  category, priority, summary, recommendation, is_initial, created_at
)
SELECT
  r.id,
  r.description,
  COALESCE(NULLIF(BTRIM(r.location), ''), 'Lokasi belum dirinci'),
  r.latitude,
  r.longitude,
  r.category,
  r.priority,
  r.summary,
  r.recommendation,
  TRUE,
  COALESCE(r.created_at, NOW())
FROM public.reports AS r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.report_complaints AS c
  WHERE c.report_id = r.id AND c.is_initial = TRUE
);

ALTER TABLE public.report_complaints ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.reports TO anon, authenticated;
GRANT SELECT ON public.report_complaints TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.report_complaints FROM anon, authenticated;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'report_complaints'
      AND policyname = 'Public can view complaints'
  ) THEN
    CREATE POLICY "Public can view complaints"
      ON public.report_complaints
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END;
$policy$;

-- Semua pengiriman laporan melewati fungsi ini agar pengecekan duplikat
-- dan penambahan keluhan dilakukan dalam satu transaksi database.
CREATE OR REPLACE FUNCTION public.submit_report_with_deduplication(
  p_description TEXT,
  p_location TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_category TEXT,
  p_priority TEXT,
  p_summary TEXT,
  p_recommendation TEXT,
  p_radius_meters DOUBLE PRECISION DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing public.reports%ROWTYPE;
  v_report_id UUID;
  v_complaint_id UUID;
  v_distance_meters DOUBLE PRECISION;
  v_complaint_count INTEGER;
  v_is_duplicate BOOLEAN := FALSE;
  v_duplicate_check TEXT := 'checked_no_match';
BEGIN
  IF p_description IS NULL OR char_length(BTRIM(p_description)) < 15
     OR char_length(BTRIM(p_description)) > 1500 THEN
    RAISE EXCEPTION 'Deskripsi harus terdiri dari 15–1500 karakter.';
  END IF;

  IF p_location IS NULL OR char_length(BTRIM(p_location)) = 0
     OR char_length(BTRIM(p_location)) > 200 THEN
    RAISE EXCEPTION 'Nama tempat atau alamat lokasi wajib diisi (maksimal 200 karakter).';
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    'Sampah', 'Jalan Rusak', 'Drainase Tersumbat',
    'Lampu Jalan', 'Banjir', 'Fasilitas Umum', 'Lainnya'
  ) THEN
    RAISE EXCEPTION 'Kategori laporan tidak valid.';
  END IF;

  IF p_priority IS NULL OR p_priority NOT IN ('Rendah', 'Sedang', 'Tinggi') THEN
    RAISE EXCEPTION 'Prioritas laporan tidak valid.';
  END IF;

  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Latitude dan longitude harus diisi bersamaan.';
  END IF;

  IF p_latitude IS NOT NULL AND (
    p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
  ) THEN
    RAISE EXCEPTION 'Koordinat GPS tidak valid.';
  END IF;

  IF p_radius_meters IS NULL OR p_radius_meters <= 0 OR p_radius_meters > 500 THEN
    RAISE EXCEPTION 'Radius deteksi harus lebih dari 0 dan maksimal 500 meter.';
  END IF;

  -- Kunci per kategori untuk mencegah dua pengiriman serentak membuat
  -- dua laporan utama untuk lokasi yang sama.
  PERFORM pg_advisory_xact_lock(
    hashtext('tuntas-report:' || lower(BTRIM(p_category))),
    0
  );

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT
      r,
      2 * 6371000 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
        POWER(SIN(RADIANS(r.latitude - p_latitude) / 2), 2) +
        COS(RADIANS(p_latitude)) * COS(RADIANS(r.latitude)) *
        POWER(SIN(RADIANS(r.longitude - p_longitude) / 2), 2)
      ))))
    INTO v_existing, v_distance_meters
    FROM public.reports AS r
    WHERE lower(r.category) = lower(BTRIM(p_category))
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND lower(COALESCE(r.status, 'baru')) NOT IN (
        'selesai', 'ditolak', 'ditutup', 'dibatalkan'
      )
    ORDER BY 2
    LIMIT 1;

    IF v_existing.id IS NOT NULL AND v_distance_meters <= p_radius_meters THEN
      v_is_duplicate := TRUE;
      v_duplicate_check := 'merged';
      v_report_id := v_existing.id;
    END IF;
  ELSE
    v_duplicate_check := 'skipped_no_gps';
  END IF;

  IF v_is_duplicate THEN
    INSERT INTO public.report_complaints (
      report_id, description, location, latitude, longitude,
      category, priority, summary, recommendation, is_initial, created_at
    ) VALUES (
      v_report_id, BTRIM(p_description), BTRIM(p_location),
      p_latitude, p_longitude, p_category, p_priority,
      COALESCE(p_summary, ''), COALESCE(p_recommendation, ''),
      FALSE, NOW()
    )
    RETURNING id INTO v_complaint_id;
  ELSE
    INSERT INTO public.reports (
      description, location, latitude, longitude, category,
      priority, summary, recommendation, status, created_at
    ) VALUES (
      BTRIM(p_description), BTRIM(p_location), p_latitude, p_longitude,
      p_category, p_priority, COALESCE(p_summary, ''),
      COALESCE(p_recommendation, ''), 'Baru', NOW()
    )
    RETURNING id INTO v_report_id;

    INSERT INTO public.report_complaints (
      report_id, description, location, latitude, longitude,
      category, priority, summary, recommendation, is_initial, created_at
    ) VALUES (
      v_report_id, BTRIM(p_description), BTRIM(p_location),
      p_latitude, p_longitude, p_category, p_priority,
      COALESCE(p_summary, ''), COALESCE(p_recommendation, ''),
      TRUE, NOW()
    )
    RETURNING id INTO v_complaint_id;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_complaint_count
  FROM public.report_complaints
  WHERE report_id = v_report_id;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'complaint_id', v_complaint_id,
    'is_duplicate', v_is_duplicate,
    'complaint_count', v_complaint_count,
    'distance_meters', CASE
      WHEN v_is_duplicate THEN ROUND(v_distance_meters::NUMERIC, 1)
      ELSE NULL
    END,
    'duplicate_check', v_duplicate_check
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_report_with_deduplication(
  TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_report_with_deduplication(
  TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION
) TO anon, authenticated;

-- Mencegah frontend lama melewati pemeriksaan duplikat dengan INSERT langsung.
REVOKE INSERT ON public.reports FROM anon, authenticated;
