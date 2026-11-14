CREATE OR REPLACE FUNCTION public.submit_report_with_deduplication(p_description text, p_location text, p_latitude double precision, p_longitude double precision, p_category text, p_priority text, p_summary text, p_recommendation text, p_radius_meters double precision DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_category_input TEXT;
  v_category TEXT;
  v_priority TEXT;
  v_description TEXT;
  v_location TEXT;
  v_report_id UUID;
  v_complaint_id UUID;
  v_distance_meters DOUBLE PRECISION;
  v_complaint_count INTEGER;
  v_is_duplicate BOOLEAN := FALSE;
  v_duplicate_check TEXT := 'checked_no_match';
  v_attachment_upload_token UUID := gen_random_uuid();
BEGIN
  v_description := BTRIM(COALESCE(p_description, ''));
  v_location := BTRIM(COALESCE(p_location, ''));
  v_category_input := BTRIM(COALESCE(p_category, ''));
  v_priority := BTRIM(COALESCE(p_priority, ''));

  IF CHAR_LENGTH(v_description) < 1 OR CHAR_LENGTH(v_description) > 1500 THEN
    RAISE EXCEPTION 'Pesan laporan harus terdiri dari 1–1500 karakter.';
  END IF;
  IF CHAR_LENGTH(v_location) = 0 OR CHAR_LENGTH(v_location) > 200 THEN
    RAISE EXCEPTION 'Lokasi wajib diisi (maksimal 200 karakter).';
  END IF;
  IF CHAR_LENGTH(v_category_input) = 0 OR CHAR_LENGTH(v_category_input) > 80 THEN
    RAISE EXCEPTION 'Kategori laporan harus diisi (maksimal 80 karakter).';
  END IF;
  IF CHAR_LENGTH(v_priority) = 0 OR CHAR_LENGTH(v_priority) > 100 THEN
    RAISE EXCEPTION 'Penilaian prioritas harus diisi (maksimal 100 karakter).';
  END IF;

  SELECT c.label INTO v_category
  FROM public.issue_categories c
  WHERE c.is_active = TRUE
    AND (
      lower(btrim(c.label)) = lower(v_category_input)
      OR EXISTS (
        SELECT 1 FROM unnest(c.aliases) AS a(value)
        WHERE lower(btrim(a.value)) = lower(v_category_input)
      )
    )
  ORDER BY (lower(btrim(c.label)) = lower(v_category_input)) DESC, c.sort_order, c.label
  LIMIT 1;

  IF v_category IS NULL THEN
    v_category := v_category_input;
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

  PERFORM pg_advisory_xact_lock(hashtext('tuntas-report:' || LOWER(v_category)), 0);

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    SELECT
      r.id,
      2.0 * 6371000.0 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
        POWER(SIN(RADIANS(r.latitude - p_latitude) / 2.0), 2.0)
        + COS(RADIANS(p_latitude)) * COS(RADIANS(r.latitude))
        * POWER(SIN(RADIANS(r.longitude - p_longitude) / 2.0), 2.0)
      )))) AS distance_meters
    INTO v_report_id, v_distance_meters
    FROM public.reports r
    WHERE LOWER(BTRIM(COALESCE(r.category, ''))) = LOWER(v_category)
      AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND LOWER(COALESCE(r.status, 'baru')) NOT IN ('selesai', 'ditolak', 'ditutup', 'dibatalkan')
    ORDER BY distance_meters ASC, r.created_at ASC, r.id ASC
    LIMIT 1;

    IF v_report_id IS NOT NULL AND v_distance_meters <= p_radius_meters THEN
      v_is_duplicate := TRUE;
      v_duplicate_check := 'merged';
    ELSE
      v_report_id := NULL;
      v_distance_meters := NULL;
    END IF;
  ELSE
    v_duplicate_check := 'skipped_no_gps';
  END IF;

  IF v_is_duplicate THEN
    INSERT INTO public.report_complaints (
      report_id, description, location, latitude, longitude, category, priority,
      summary, recommendation, is_initial, created_at
    )
    VALUES (
      v_report_id, v_description, v_location, p_latitude, p_longitude,
      v_category, v_priority, COALESCE(p_summary, ''),
      COALESCE(p_recommendation, ''), FALSE, NOW()
    )
    RETURNING id INTO v_complaint_id;
  ELSE
    INSERT INTO public.reports (
      description, location, latitude, longitude, category, priority,
      summary, recommendation, status, created_at
    )
    VALUES (
      v_description, v_location, p_latitude, p_longitude, v_category,
      v_priority, COALESCE(p_summary, ''), COALESCE(p_recommendation, ''),
      'Baru', NOW()
    )
    RETURNING id INTO v_report_id;

    INSERT INTO public.report_complaints (
      report_id, description, location, latitude, longitude, category, priority,
      summary, recommendation, is_initial, created_at
    )
    VALUES (
      v_report_id, v_description, v_location, p_latitude, p_longitude,
      v_category, v_priority, COALESCE(p_summary, ''),
      COALESCE(p_recommendation, ''), TRUE, NOW()
    )
    RETURNING id INTO v_complaint_id;
  END IF;

  INSERT INTO public.complaint_attachment_upload_tickets (complaint_id, upload_token, expires_at)
  VALUES (v_complaint_id, v_attachment_upload_token, NOW() + INTERVAL '24 hours');

  SELECT COUNT(*)::INTEGER INTO v_complaint_count
  FROM public.report_complaints c
  WHERE c.report_id = v_report_id;

  RETURN JSONB_BUILD_OBJECT(
    'report_id', v_report_id,
    'complaint_id', v_complaint_id,
    'attachment_upload_token', v_attachment_upload_token,
    'is_duplicate', v_is_duplicate,
    'complaint_count', v_complaint_count,
    'distance_meters', CASE WHEN v_is_duplicate THEN ROUND(v_distance_meters::NUMERIC, 1) ELSE NULL END,
    'duplicate_check', v_duplicate_check
  );
END;
$function$

