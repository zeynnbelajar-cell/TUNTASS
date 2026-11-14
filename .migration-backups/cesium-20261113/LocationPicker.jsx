import React, { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, LoaderCircle, Eye, Globe2, Box } from "lucide-react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(mapLibreWorkerUrl);

const GEOAPIFY_KEY = String(import.meta.env.VITE_GEOAPIFY_API_KEY || "").trim();
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
const DEFAULT_CENTER = [118, -2.5];

function validCoordinates(value) {
  return (
    value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
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
}) {
  const [searchText, setSearchText] = useState(location || "");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [mapError, setMapError] = useState("");
  const [is3D, setIs3D] = useState(true);
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const selectedTextRef = useRef("");
  const callbacksRef = useRef({});
  const coordinatesRef = useRef(coordinates);
  const reverseControllerRef = useRef(null);
  const hasSyncedCoordinatesRef = useRef(false);
  const gpsAnimationRef = useRef(false);
  coordinatesRef.current = coordinates;

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

  useEffect(() => {
    if (!GEOAPIFY_KEY || !mapElementRef.current) return undefined;

    const initialCoordinates = coordinatesRef.current;
    const initialCenter = DEFAULT_CENTER;
    const styleUrl = `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;
    const map = new MapLibreMap({
      container: mapElementRef.current,
      style: styleUrl,
      center: initialCenter,
      zoom: 1.8,
      minZoom: 1,
      maxZoom: 20,
      pitch: 0,
      projection: { type: "globe" },
      attributionControl: true,
      cooperativeGestures: true,
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;

    map.on("load", () => {
      setMapError("");
      map.setFog({ color: "rgb(220, 232, 245)", "high-color": "rgb(35, 75, 125)", "space-color": "rgb(5, 12, 28)", "horizon-blend": 0.08 });
      const styleLayers = map.getStyle().layers || [];
      const firstSymbolLayer = styleLayers.find((layer) => layer.type === "symbol")?.id;
      if (!map.getLayer("tuntas-3d-buildings")) {
        map.addLayer({
          id: "tuntas-3d-buildings",
          type: "fill-extrusion",
          source: "default",
          "source-layer": "building",
          minzoom: 14.5,
          filter: ["all", ["==", ["geometry-type"], "Polygon"], ["any", ["has", "render_height"], ["has", "height"]]],
          paint: {
            "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 0], 0, "#d8d6ce", 8, "#c7c5bd", 30, "#aaa99f", 80, "#92958f"],
            "fill-extrusion-height": ["max", ["coalesce", ["get", "render_height"], ["get", "height"], 0], 1],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.92,
            "fill-extrusion-vertical-gradient": true
          }
        }, firstSymbolLayer);
      }
      const currentCoordinates = coordinatesRef.current;
      if (validCoordinates(currentCoordinates) && !markerRef.current) {
        markerRef.current = new Marker({ color: "#087b5a" })
          .setLngLat([currentCoordinates.longitude, currentCoordinates.latitude])
          .addTo(map);
      }
    });

    map.on("error", (event) => {
      const message = event?.error?.message || "";
      if (/401|403|429|style|tile|source/i.test(message)) {
        setMapError("Peta gagal dimuat. Periksa API key Geoapify, izin domain, atau kuota peta.");
        console.error("MapLibre map error:", event.error);
      }
    });

    map.on("click", (event) => {
      const point = {
        latitude: Number(event.lngLat.lat.toFixed(6)),
        longitude: Number(event.lngLat.lng.toFixed(6)),
      };
      callbacksRef.current.onCoordinatesChange?.(point);
      callbacksRef.current.onSourceChange?.("map_pin");
      callbacksRef.current.onLocationChange?.("");
      setSearchText("");
      selectedTextRef.current = "";
      setSuggestions([]);
      resolveAddress(point, "map_pin");
    });

    return () => {
      reverseControllerRef.current?.abort();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map instance is intentionally created once; coordinates are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!validCoordinates(coordinates)) {
      hasSyncedCoordinatesRef.current = true;
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const point = [coordinates.longitude, coordinates.latitude];
    if (!hasSyncedCoordinatesRef.current) {
      hasSyncedCoordinatesRef.current = true;
      if (markerRef.current) markerRef.current.setLngLat(point);
      else markerRef.current = new Marker({ color: "#087b5a" }).setLngLat(point).addTo(map);
      return;
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const gpsFlight = gpsAnimationRef.current;
    gpsAnimationRef.current = false;
    if (gpsFlight || (map.getProjection()?.type === "globe" && map.getZoom() > 3)) map.setProjection({ type: "mercator" });
    if (reducedMotion) {
      map.jumpTo({ center: point, zoom: gpsFlight ? 17 : Math.max(map.getZoom(), 15), pitch: gpsFlight ? 58 : (is3D ? 48 : 0) });
    } else {
      map.flyTo({ center: point, zoom: gpsFlight ? 17 : Math.max(map.getZoom(), 15), pitch: gpsFlight ? 58 : (is3D ? 48 : 0), curve: 1.55, speed: gpsFlight ? 0.72 : 1.15, duration: gpsFlight ? 4200 : 1300, essential: true });
    }

    if (markerRef.current) {
      markerRef.current.setLngLat(point);
    } else {
      markerRef.current = new Marker({ color: "#087b5a" }).setLngLat(point).addTo(map);
    }
  }, [coordinates, is3D]);

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
      callbacksRef.current.onSourceChange?.(source);
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
    callbacksRef.current.onSourceChange?.("manual");
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
    callbacksRef.current.onSourceChange?.("search");
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
        gpsAnimationRef.current = true;
        callbacksRef.current.onCoordinatesChange?.(point);
        callbacksRef.current.onLocationChange?.("");
        callbacksRef.current.onSourceChange?.("gps");
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
            required
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

      {GEOAPIFY_KEY ? (
        <div className="location-map-frame">
          <div ref={mapElementRef} className="location-map" aria-label="Peta globe 3D untuk memilih titik laporan" />
          <div className="map-instruction"><MapPin size={13} /> Globe 3D · Ketuk peta untuk menentukan titik laporan</div>
          <div className="location-map-actions">
            <button type="button" className={`map-mode-button ${is3D ? "active" : ""}`} onClick={() => { setIs3D((value) => !value); mapRef.current?.easeTo({ pitch: is3D ? 0 : 55, duration: 900 }); }} aria-pressed={is3D}>
              <Box size={15} /> {is3D ? "Mode 3D aktif" : "Aktifkan 3D"}
            </button>
            <button type="button" className="map-mode-button map-streetview-button" onClick={() => { if (validCoordinates(coordinates)) { setStreetViewOpen(true); } else { setSearchMessage("Pilih lokasi atau gunakan GPS terlebih dahulu untuk membuka Street View."); } }} disabled={!validCoordinates(coordinates)}>
              <Eye size={15} /> Street View
            </button>
            <button type="button" className="map-mode-button" onClick={() => { mapRef.current?.flyTo({ center: [118, -2.5], zoom: 1.8, pitch: 0, duration: 1800 }); mapRef.current?.setProjection({ type: "globe" }); }}>
              <Globe2 size={15} /> Globe
            </button>
          </div>
          {streetViewOpen && (
            <div className="street-view-overlay" role="dialog" aria-modal="true" aria-label="Street View">
              <div className="street-view-header">
                <strong>Street View · Panorama 360°</strong>
                <button type="button" onClick={() => setStreetViewOpen(false)} aria-label="Tutup Street View">Tutup ✕</button>
              </div>
              {GOOGLE_MAPS_API_KEY ? (
                <iframe
                  title="Google Street View panorama"
                  src={`https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&location=${coordinates.latitude},${coordinates.longitude}&heading=0&pitch=0&fov=90`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              ) : (
                <div className="street-view-key-required">
                  <Eye size={30} />
                  <strong>Aktifkan panorama Street View di dalam TUNTAS</strong>
                  <p>Tambahkan VITE_GOOGLE_MAPS_API_KEY setelah membuat API key Google Maps Platform dan mengaktifkan Maps Embed API serta billing.</p>
                  <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinates.latitude},${coordinates.longitude}`} target="_blank" rel="noreferrer">Buka lokasi ini di Google Maps Street View ↗</a>
                </div>
              )}
              <small>Panorama tersedia jika Google memiliki citra Street View di sekitar titik ini.</small>
            </div>
          )}
        </div>
      ) : (
        <div className="map-unavailable" role="status">
          <MapPin size={18} />
          <span>Peta interaktif belum aktif. Lengkapi kunci layanan peta untuk mencari alamat dan memilih titik langsung dari peta.</span>
        </div>
      )}

      {mapError && <p className="location-status location-status-error" role="alert">{mapError}</p>}
      {searchMessage && <p className="location-status" role="status">{resolvingAddress ? <LoaderCircle className="spin-icon" size={13} /> : <MapPin size={13} />}{searchMessage}</p>}
      {!searchMessage && validCoordinates(coordinates) && (
        <p className="location-status"><MapPin size={13} />Titik koordinat siap digunakan untuk mencari keluhan serupa dalam radius 50 meter.</p>
      )}
    </div>
  );
}
