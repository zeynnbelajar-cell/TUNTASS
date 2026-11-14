import React, { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, LoaderCircle } from "lucide-react";
import CesiumEarthMap from "./CesiumEarthMap";
import MapLibreFallback from "./MapLibreFallback";

const GEOAPIFY_KEY = String(import.meta.env.VITE_GEOAPIFY_API_KEY || "").trim();

function validCoordinates(value) {
  return (
    value &&
    Number.isFinite(Number(value.latitude)) &&
    Number.isFinite(Number(value.longitude)) &&
    Number(value.latitude) >= -90 &&
    Number(value.latitude) <= 90 &&
    Number(value.longitude) >= -180 &&
    Number(value.longitude) <= 180
  );
}

function distanceMeters(first, second) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(Number(second.latitude) - Number(first.latitude));
  const longitudeDelta = toRadians(Number(second.longitude) - Number(first.longitude));
  const latitude1 = toRadians(Number(first.latitude));
  const latitude2 = toRadians(Number(second.latitude));
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function normalizedResult(result) {
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    label: String(result.formatted || result.address_line1 || result.name || "Lokasi terpilih"),
    details: [result.city || result.county, result.state, result.country]
      .filter(Boolean)
      .join(", "),
    latitude,
    longitude,
    resultType: result.result_type || "",
  };
}

export default function LocationPicker({
  location,
  coordinates,
  onLocationChange,
  onCoordinatesChange,
  onSourceChange,
  onResolvingChange,
  onError,
  disabled = false,
  reports = [],
  communityPhotos = [],
}) {
  const [searchText, setSearchText] = useState(location || "");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapEngine, setMapEngine] = useState("cesium");
  const [mapSource, setMapSource] = useState("manual");
  const [searchMessage, setSearchMessage] = useState("");
  const nearbyCommunityPhotos = validCoordinates(coordinates)
    ? communityPhotos
        .filter((photo) =>
          validCoordinates(photo) &&
          typeof photo.signedUrl === "string" &&
          distanceMeters(coordinates, photo) <= 2000
        )
        .slice(0, 12)
    : [];
  const selectedTextRef = useRef("");
  const callbacksRef = useRef({});
  const reverseControllerRef = useRef(null);

  callbacksRef.current = {
    onLocationChange,
    onCoordinatesChange,
    onSourceChange,
    onResolvingChange,
    onError,
  };

  useEffect(() => {
    setSearchText(location || "");
  }, [location]);

  useEffect(() => {
    callbacksRef.current.onResolvingChange?.(resolvingAddress || locating);
  }, [resolvingAddress, locating]);

  function updateMapSource(source) {
    setMapSource(source);
    callbacksRef.current.onSourceChange?.(source);
  }

  function handleMapPick(point) {
    callbacksRef.current.onCoordinatesChange?.(point);
    callbacksRef.current.onLocationChange?.("");
    updateMapSource("map_pin");
    selectedTextRef.current = "";
    setSearchText("");
    setSuggestions([]);
    resolveAddress(point, "map_pin");
  }

  async function resolveAddress(point, source) {
    if (!validCoordinates(point) || !GEOAPIFY_KEY) {
      setSearchMessage("Titik tersimpan. Isi alamat secara manual untuk melengkapinya.");
      return;
    }

    reverseControllerRef.current?.abort();
    const controller = new AbortController();
    reverseControllerRef.current = controller;
    setResolvingAddress(true);
    setSearchMessage("Mencari alamat dari titik peta...");

    try {
      const params = new URLSearchParams({
        lat: String(point.latitude),
        lon: String(point.longitude),
        format: "json",
        lang: "id",
        limit: "1",
        apiKey: GEOAPIFY_KEY,
      });
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?${params}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error("Alamat belum berhasil ditemukan dari peta.");

      const payload = await response.json();
      const result = normalizedResult(payload?.results?.[0]);
      if (!result) throw new Error("Tidak ada alamat yang cocok untuk titik ini.");

      selectedTextRef.current = result.label;
      setSearchText(result.label);
      callbacksRef.current.onLocationChange?.(result.label);
      callbacksRef.current.onCoordinatesChange?.(point);
      updateMapSource(source);
      setSearchMessage(result.details ? `Lokasi terdeteksi · ${result.details}` : "Alamat ditemukan dari peta.");
    } catch (error) {
      if (error.name !== "AbortError") {
        setSearchMessage(error.message || "Alamat gagal ditemukan. Isi alamat secara manual.");
      }
    } finally {
      if (!controller.signal.aborted) setResolvingAddress(false);
    }
  }

  useEffect(() => {
    const query = searchText.trim();
    if (!GEOAPIFY_KEY || query.length < 3 || query === selectedTextRef.current) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchMessage("");
      try {
        const params = new URLSearchParams({
          text: query,
          filter: "countrycode:id",
          lang: "id",
          format: "json",
          limit: "5",
          apiKey: GEOAPIFY_KEY,
        });
        const response = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?${params}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Pencarian alamat gagal. Coba lagi.");
        const payload = await response.json();
        const results = (payload?.results || []).map(normalizedResult).filter(Boolean);
        setSuggestions(results);
        setSearchMessage(results.length ? "" : "Lokasi belum ditemukan. Coba nama jalan atau kelurahan.");
      } catch (error) {
        if (error.name !== "AbortError") {
          setSuggestions([]);
          setSearchMessage(error.message || "Pencarian alamat gagal.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, searchRevision]);

  function handleSearchChange(event) {
    const nextValue = event.target.value;
    selectedTextRef.current = "";
    setSearchText(nextValue);
    setSuggestions([]);
    setSearchMessage("");
    callbacksRef.current.onError?.("");
    callbacksRef.current.onLocationChange?.(nextValue);
    callbacksRef.current.onCoordinatesChange?.(null);
    updateMapSource("manual");
  }

  function chooseSuggestion(suggestion) {
    selectedTextRef.current = suggestion.label;
    setSearchText(suggestion.label);
    setSuggestions([]);
    setSearchMessage(suggestion.details ? `Lokasi ditemukan · ${suggestion.details}` : "Lokasi ditemukan dari peta.");
    const point = {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };
    callbacksRef.current.onLocationChange?.(suggestion.label);
    callbacksRef.current.onCoordinatesChange?.(point);
    updateMapSource("search");
  }

  function useGps() {
    callbacksRef.current.onError?.("");
    if (!navigator.geolocation) {
      callbacksRef.current.onError?.("Browser ini tidak mendukung GPS.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        callbacksRef.current.onCoordinatesChange?.(point);
        callbacksRef.current.onLocationChange?.("");
        updateMapSource("gps");
        selectedTextRef.current = "";
        setSearchText("");
        setSuggestions([]);
        resolveAddress(point, "gps");
        setLocating(false);
      },
      (geoError) => {
        const message = geoError.code === 1
          ? "Izin lokasi ditolak. Cari alamat atau pilih titik peta secara manual."
          : geoError.code === 2
            ? "Lokasi perangkat tidak berhasil ditemukan. Coba lagi atau pilih peta."
            : "GPS terlalu lama merespons. Coba lagi atau pilih titik di peta.";
        callbacksRef.current.onError?.(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  return (
    <div className="location-picker">
      <div className="location-search-wrap">
        <div className="location-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            id="location"
            value={searchText}
            onChange={handleSearchChange}
            onFocus={() => {
              if (searchText.trim().length >= 3 && searchText !== selectedTextRef.current) {
                setSearchRevision((revision) => revision + 1);
              }
            }}
            onBlur={() => window.setTimeout(() => setSuggestions([]), 150)}
            placeholder="Cari alamat, jalan, kelurahan, atau tempat..."
            maxLength={200}
            autoComplete="off"
            disabled={disabled}
            aria-autocomplete="list"
            aria-controls="location-suggestions"
          />
          {searching && <LoaderCircle className="spin-icon" size={16} aria-label="Mencari" />}
        </div>
        {suggestions.length > 0 && (
          <div className="location-suggestions" id="location-suggestions" role="listbox">
            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                className="location-suggestion"
                key={`${suggestion.latitude}:${suggestion.longitude}:${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(suggestion)}
                disabled={disabled}
                role="option"
                aria-selected="false"
              >
                <MapPin size={15} />
                <span>
                  <strong>{suggestion.label}</strong>
                  {suggestion.details && <small>{suggestion.details}</small>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="location-actions">
        <button
          className="location-button"
          type="button"
          onClick={useGps}
          disabled={disabled || locating || resolvingAddress}
        >
          <LocateFixed size={15} />
          {locating ? "Mencari GPS..." : "Gunakan lokasi saya"}
        </button>
        {validCoordinates(coordinates) && (
          <span className="coordinate-badge">{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</span>
        )}
      </div>

      <div className="location-map-frame">
        {mapEngine === "cesium" ? (
          <CesiumEarthMap
            coordinates={coordinates}
            source={mapSource}
            reports={reports}
            viewMode={validCoordinates(coordinates) ? "location" : "globe"}
            onPick={handleMapPick}
            onError={() => {
              setMapError("Globe 3D tidak dapat dijalankan pada perangkat ini. Peta cadangan diaktifkan.");
              setMapEngine("maplibre");
            }}
          />
        ) : GEOAPIFY_KEY ? (
          <MapLibreFallback
            coordinates={coordinates}
            onPick={handleMapPick}
            is3D={true}
          />
        ) : (
          <div className="map-unavailable" role="status">
            <MapPin size={18} />
            <span>WebGL tidak tersedia dan peta cadangan belum dapat dimuat.</span>
          </div>
        )}
        <div className="map-instruction"><MapPin size={13} /> {mapEngine === "cesium" ? "Jelajahi bumi · seret untuk memutar · scroll untuk zoom · klik untuk titik laporan" : "Peta cadangan · ketuk untuk menentukan titik"}</div>
      </div>

      {validCoordinates(coordinates) && (
        <section className="location-auto-explore" aria-label="Jelajah jalan di sekitar titik laporan">
          <div className="location-auto-explore-heading">
            <div>
              <strong>Jelajah jalan di sekitar titik</strong>
              <p>Bagian ini muncul otomatis setelah lokasi dipilih. Panorama hanya tersedia jika ada rekaman di area tersebut.</p>
            </div>
            <div className="street-view-source-links">
              <a
                href={`https://www.mapillary.com/app/?lat=${coordinates.latitude}&lng=${coordinates.longitude}&z=17`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat Mapillary ↗
              </a>
              <a
                href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinates.latitude},${coordinates.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat Street View ↗
              </a>
            </div>
          </div>

          {nearbyCommunityPhotos.length > 0 ? (
            <div className="street-view-community-gallery">
              <strong>Foto laporan warga sekitar · maksimal 2 km</strong>
              <div className="street-view-community-grid">
                {nearbyCommunityPhotos.map((photo) => (
                  <a
                    href={photo.signedUrl}
                    key={photo.id}
                    target="_blank"
                    rel="noreferrer"
                    title={photo.fileName || "Foto laporan warga"}
                  >
                    <img
                      src={photo.signedUrl}
                      alt={photo.category ? `Bukti laporan ${photo.category}` : "Bukti foto laporan warga"}
                      loading="lazy"
                    />
                    <span>{photo.category || "Laporan warga"}</span>
                  </a>
                ))}
              </div>
              <p>Foto bukti warga, bukan panorama 360°.</p>
            </div>
          ) : (
            <p className="location-auto-explore-empty">
              Belum ada foto bukti warga dalam radius 2 km dari titik ini.
            </p>
          )}
        </section>
      )}

      {mapError && <p className="location-status location-status-error" role="alert">{mapError}</p>}
      {searchMessage && <p className="location-status" role="status">{resolvingAddress ? <LoaderCircle className="spin-icon" size={13} /> : <MapPin size={13} />}{searchMessage}</p>}
      {!searchMessage && validCoordinates(coordinates) && (
        <p className="location-status"><MapPin size={13} />Titik koordinat siap digunakan untuk mencari keluhan serupa dalam radius 50 meter.</p>
      )}
    </div>
  );
}
