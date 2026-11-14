const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode";
const MAX_GEMINI_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const ALLOWED_CATEGORIES = [
  "Sampah",
  "Jalan Rusak",
  "Drainase Tersumbat",
  "Lampu Jalan",
  "Banjir",
  "Fasilitas Umum",
  "Lainnya",
];

type Coordinates = { latitude: number; longitude: number } | null;
type LocationContext = {
  provider: "Geoapify";
  status:
    | "verified"
    | "matched"
    | "low_confidence"
    | "not_found"
    | "unavailable"
    | "not_configured";
  location_source: string;
  formatted_address?: string;
  administrative_area?: string;
  result_type?: string;
  confidence: number | null;
  match_type?: string;
  nearby_places: Array<{
    name: string;
    category: string;
    formatted_address?: string;
    distance_meters: number | null;
  }>;
  nearby_places_status: "available" | "empty" | "unavailable" | "not_requested";
  coordinates: Coordinates;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function parseCoordinates(body: Record<string, unknown>): Coordinates | undefined {
  const hasLatitude = body.latitude !== null && body.latitude !== undefined && body.latitude !== "";
  const hasLongitude = body.longitude !== null && body.longitude !== undefined && body.longitude !== "";
  if (hasLatitude !== hasLongitude) return undefined;
  if (!hasLatitude) return null;

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) return undefined;

  return { latitude, longitude };
}

function administrativeArea(result: Record<string, any>): string {
  const firstLevel = result.suburb || result.district || result.neighbourhood || result.county;
  const secondLevel = result.city || result.county;
  return [...new Set([firstLevel, secondLevel, result.state].filter(Boolean))].join(", ");
}

async function getMapContext(
  apiKey: string | undefined,
  location: string,
  coordinates: Coordinates,
  locationSource: string,
): Promise<LocationContext> {
  const base = {
    provider: "Geoapify" as const,
    location_source: locationSource,
    confidence: null,
    nearby_places: [] as LocationContext["nearby_places"],
    nearby_places_status: "not_requested" as const,
    coordinates: null,
  };

  if (!apiKey) return { ...base, status: "not_configured" };

  if (!coordinates && !location) return { ...base, status: "not_found" };

  const url = new URL(coordinates ? `${GEOAPIFY_URL}/reverse` : `${GEOAPIFY_URL}/search`);
  if (coordinates) {
    url.searchParams.set("lat", String(coordinates.latitude));
    url.searchParams.set("lon", String(coordinates.longitude));
  } else {
    url.searchParams.set("text", location);
    url.searchParams.set("filter", "countrycode:id");
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "id");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      console.warn("Geoapify request failed", { status: response.status });
      return { ...base, status: "unavailable" };
    }

    const payload = await response.json().catch(() => null);
    const result = payload?.results?.[0];
    if (!result) return { ...base, status: "not_found" };

    const confidenceValue = Number(result.rank?.confidence);
    const confidence = Number.isFinite(confidenceValue) ? confidenceValue : null;
    const countryCode = String(result.country_code || "").toLowerCase();
    const isIndonesia = countryCode === "id" || result.country === "Indonesia";
    const resultType = typeof result.result_type === "string" ? result.result_type : "";
    const matchType = typeof result.rank?.match_type === "string" ? result.rank.match_type : "";
    const isStreetOrPlaceMatch = ["building", "street", "amenity"].includes(resultType);
    const status = isIndonesia && confidence !== null && confidence >= 0.6 && isStreetOrPlaceMatch
      ? "verified"
      : (isIndonesia ? "matched" : "low_confidence");

    const resultLatitude = Number(result.lat);
    const resultLongitude = Number(result.lon);
    const hasGeocodedPoint = Number.isFinite(resultLatitude) && Number.isFinite(resultLongitude);
    const hasSpecificGeocodedPoint = hasGeocodedPoint && ["building", "amenity"].includes(resultType);
    const resolvedCoordinates = coordinates || (hasSpecificGeocodedPoint
      ? { latitude: resultLatitude, longitude: resultLongitude }
      : null);

    let nearbyPlaces: LocationContext["nearby_places"] = [];
    let nearbyPlacesStatus: LocationContext["nearby_places_status"] = "not_requested";
    const canInspectNearbyPlaces = Boolean(coordinates) && ["gps", "map_pin"].includes(locationSource)
      || hasSpecificGeocodedPoint;
    if (canInspectNearbyPlaces && resolvedCoordinates) {
      const nearbyPoint = resolvedCoordinates;
      if (nearbyPoint) {
        const placesUrl = new URL("https://api.geoapify.com/v2/places");
        placesUrl.searchParams.set("categories", "education,healthcare,commercial,public_transport,leisure");
        placesUrl.searchParams.set(
          "filter",
          `circle:${nearbyPoint.longitude},${nearbyPoint.latitude},500`,
        );
        placesUrl.searchParams.set(
          "bias",
          `proximity:${nearbyPoint.longitude},${nearbyPoint.latitude}`,
        );
        placesUrl.searchParams.set("limit", "5");
        placesUrl.searchParams.set("lang", "id");
        placesUrl.searchParams.set("apiKey", apiKey);

        try {
          const placesResponse = await fetch(placesUrl, { signal: AbortSignal.timeout(4000) });
          if (placesResponse.ok) {
            const placesPayload = await placesResponse.json().catch(() => null);
            const placeResults = placesPayload?.features || placesPayload?.results || [];
            nearbyPlaces = placeResults
              .map((feature: Record<string, any>) => feature.properties || feature)
              .filter((place: Record<string, any>) => typeof place.name === "string" && place.name.trim())
              .slice(0, 5)
              .map((place: Record<string, any>) => ({
                name: place.name.trim().slice(0, 120),
                category: Array.isArray(place.categories) && typeof place.categories[0] === "string"
                  ? place.categories[0]
                  : "Tempat di sekitar",
                formatted_address: typeof place.formatted === "string"
                  ? place.formatted.slice(0, 200)
                  : undefined,
                distance_meters: Number.isFinite(Number(place.distance))
                  ? Number(place.distance)
                  : null,
              }));
            nearbyPlacesStatus = nearbyPlaces.length ? "available" : "empty";
          } else {
            nearbyPlacesStatus = "unavailable";
            console.warn("Geoapify Places request failed", { status: placesResponse.status });
          }
        } catch {
          nearbyPlacesStatus = "unavailable";
          console.warn("Geoapify Places could not be reached");
        }
      }
    }

    return {
      provider: "Geoapify",
      status,
      location_source: locationSource,
      formatted_address: typeof result.formatted === "string" ? result.formatted : undefined,
      administrative_area: administrativeArea(result),
      result_type: resultType || undefined,
      confidence,
      match_type: matchType || undefined,
      nearby_places: nearbyPlaces,
      nearby_places_status: nearbyPlacesStatus,
      coordinates: resolvedCoordinates,
    };
  } catch (error) {
    console.warn("Geoapify could not be reached", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { ...base, status: "unavailable" };
  }
}

async function requestGemini(
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<{ response: Response | null; attempts: number; networkError?: unknown }> {
  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000),
      });

      if (
        response.ok ||
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === MAX_GEMINI_ATTEMPTS
      ) {
        return { response, attempts: attempt };
      }

      console.warn("Gemini sementara gagal; menjadwalkan retry", {
        status: response.status,
        attempt,
      });
    } catch (networkError) {
      if (attempt === MAX_GEMINI_ATTEMPTS) {
        return { response: null, attempts: attempt, networkError };
      }

      console.warn("Koneksi ke Gemini gagal; menjadwalkan retry", { attempt });
    }

    const delayCeiling = Math.min(4000, 500 * 2 ** (attempt - 1));
    const delayMs = Math.floor(Math.random() * delayCeiling);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { response: null, attempts: MAX_GEMINI_ATTEMPTS };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 16_384) {
    return jsonResponse({ error: "Ukuran permintaan terlalu besar." }, 413);
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur di Supabase secrets.");

    const body = await req.json();
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const coordinates = parseCoordinates(body);
    const locationSource = typeof body.location_source === "string"
      ? body.location_source.slice(0, 24)
      : "manual";

    if (description.length < 15 || description.length > 1500) {
      return jsonResponse({ error: "Deskripsi harus terdiri dari 15–1500 karakter." }, 400);
    }
    if (!location || location.length > 200) {
      return jsonResponse({ error: "Lokasi wajib diisi dan maksimal 200 karakter." }, 400);
    }
    if (coordinates === undefined) {
      return jsonResponse({ error: "Koordinat lokasi tidak valid. Periksa kembali titik peta." }, 400);
    }

    const locationContext = await getMapContext(
      Deno.env.get("GEOAPIFY_API_KEY"),
      location,
      coordinates,
      locationSource,
    );

    const prompt = `Kamu adalah asisten triase laporan masalah lingkungan untuk aplikasi AKSILOOP di Indonesia.

DATA LAPORAN WARGA:
${JSON.stringify({ description, location })}

KONTEKS ALAMAT DARI LAYANAN PETA:
${JSON.stringify(locationContext)}

ATURAN ANALISIS:
1. Tentukan kategori dan prioritas terutama dari DESKRIPSI warga. Konteks peta hanya membantu memahami alamat dan wilayah administratif.
2. Data peta TIDAK membuktikan bahwa kejadian atau kerusakan benar-benar ada. Jangan menyimpulkan jalan rusak, sampah menumpuk, banjir, atau saluran tersumbat hanya karena nama lokasi atau objek peta.
3. Jangan menyebut alamat telah cocok dengan peta jika status konteks peta bukan "verified" atau "matched". Jika statusnya "low_confidence", "not_found", "unavailable", atau "not_configured", nyatakan bahwa alamat belum dapat dipastikan dari peta.
4. Jangan mengarang nama jalan, kelurahan, kecamatan, kota, fasilitas, penyebab, dampak, atau bukti lapangan.
5. Beri prioritas tinggi hanya untuk indikasi bahaya atau dampak serius yang jelas dalam deskripsi warga.
6. Jangan menyarankan warga melakukan pekerjaan berbahaya, memperbaiki instalasi listrik, masuk ke saluran, atau menghadapi pelaku. Jika masalah membutuhkan kewenangan pemerintah/ahli, sarankan pelaporan ke pihak berwenang.

Kembalikan HANYA JSON valid dengan bentuk:
{
  "category": "Sampah | Jalan Rusak | Drainase Tersumbat | Lampu Jalan | Banjir | Fasilitas Umum | Lainnya",
  "priority": "Rendah | Sedang | Tinggi",
  "summary": "Ringkasan faktual maksimal 35 kata",
  "recommendation": "Saran tindakan aman dan realistis maksimal 50 kata"
}`;

    const { response, attempts, networkError } = await requestGemini(apiKey, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", enum: ALLOWED_CATEGORIES },
            priority: { type: "STRING", enum: ["Rendah", "Sedang", "Tinggi"] },
            summary: { type: "STRING" },
            recommendation: { type: "STRING" },
          },
          required: ["category", "priority", "summary", "recommendation"],
        },
      },
    });

    if (!response) {
      console.error("Gemini tidak dapat dihubungi setelah retry", {
        attempts,
        error: networkError instanceof Error ? networkError.name : "Unknown network error",
      });
      return jsonResponse({
        code: "AI_TEMPORARILY_UNAVAILABLE",
        error: "Layanan AI sedang tidak dapat dihubungi. Coba kirim laporan kembali beberapa saat lagi.",
      }, 503);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const upstreamStatus = payload?.error?.status;
      console.error("Gemini API request gagal", {
        httpStatus: response.status,
        upstreamStatus: typeof upstreamStatus === "string" ? upstreamStatus : null,
        attempts,
      });

      if (response.status === 503 || RETRYABLE_STATUSES.has(response.status)) {
        return jsonResponse({
          code: "AI_TEMPORARILY_UNAVAILABLE",
          error: "Layanan AI sedang sibuk. Coba kirim laporan kembali beberapa saat lagi.",
        }, 503);
      }
      if (response.status === 429) {
        return jsonResponse({
          code: "AI_RATE_LIMITED",
          error: "Batas permintaan atau kuota Gemini sedang tercapai. Periksa penggunaan API, lalu coba lagi nanti.",
        }, 429);
      }
      return jsonResponse({
        code: "AI_PROVIDER_ERROR",
        error: "Gemini menolak permintaan. Periksa API key, akses model, dan konfigurasi permintaan.",
      }, 502);
    }

    if (!payload) {
      return jsonResponse({
        code: "AI_INVALID_RESPONSE",
        error: "Respons dari layanan AI tidak dapat dibaca. Coba lagi.",
      }, 502);
    }

    const responseText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) throw new Error("Gemini tidak mengembalikan hasil.");

    const analysis = JSON.parse(responseText);
    if (!ALLOWED_CATEGORIES.includes(analysis.category)) analysis.category = "Lainnya";
    if (!["Rendah", "Sedang", "Tinggi"].includes(analysis.priority)) analysis.priority = "Sedang";

    return jsonResponse({ analysis, location_context: locationContext });
  } catch (error) {
    console.error("Analisis laporan gagal", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonResponse({
      code: "AI_ANALYSIS_FAILED",
      error: error instanceof Error ? error.message : "Terjadi kesalahan.",
    }, 500);
  }
});
