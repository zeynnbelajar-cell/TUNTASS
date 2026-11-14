const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted.", "AbortError");
}

function waitForRetry(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function requestOverpassBuildings(
  query,
  {
    signal,
    fetchImpl = globalThis.fetch,
    isOnline = () => globalThis.navigator?.onLine !== false,
    random = Math.random,
    wait = waitForRetry,
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Fetch is unavailable.");
  }

  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw abortError(signal);
    if (!isOnline()) {
      const error = new Error("NETWORK_OFFLINE");
      error.code = "NETWORK_OFFLINE";
      throw error;
    }

    try {
      const response = await fetchImpl("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
        signal,
      });

      if (response.ok) return response;

      const error = new Error(`Overpass HTTP ${response.status}`);
      error.status = response.status;
      lastError = error;

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) {
        throw error;
      }
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw abortError(signal);
      lastError = error;

      const retryableNetworkError =
        error instanceof TypeError && isOnline();
      const retryableServerError = RETRYABLE_STATUSES.has(error?.status);

      if (attempt === 1 || (!retryableNetworkError && !retryableServerError)) {
        throw error;
      }
    }

    const backoff = Math.max(0, Math.min(800, random() * 800));
    await wait(backoff, signal);
  }

  throw lastError || new Error("Overpass request failed.");
}

export function getOverpassFailureMessage(error, isOnline = () => globalThis.navigator?.onLine !== false) {
  if (!isOnline() || error?.code === "NETWORK_OFFLINE") {
    return "Tidak ada koneksi internet. Data bangunan akan dicoba lagi saat online.";
  }
  if ([502, 503, 504].includes(error?.status)) {
    return "Server OpenStreetMap sedang sibuk. Globe dan laporan tetap bisa digunakan.";
  }
  if (error?.status === 429) {
    return "Server OpenStreetMap membatasi permintaan. Coba lagi beberapa saat nanti.";
  }
  return "Data bangunan OpenStreetMap tidak tersedia untuk sementara.";
}
