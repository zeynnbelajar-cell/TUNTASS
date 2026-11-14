import React, { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const GEOAPIFY_KEY = String(import.meta.env.VITE_GEOAPIFY_API_KEY || "").trim();

export default function MapLibreFallback({ coordinates, onPick, is3D = true }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const callbackRef = useRef(onPick);
  callbackRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || !GEOAPIFY_KEY) return undefined;

    const style = `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: [118, -2.5],
      zoom: 2,
      minZoom: 1,
      maxZoom: 19,
      attributionControl: true,
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl(), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;

    map.on("click", (event) => {
      callbackRef.current?.({
        latitude: Number(event.lngLat.lat.toFixed(6)),
        longitude: Number(event.lngLat.lng.toFixed(6)),
      });
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coordinates) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const point = [Number(coordinates.longitude), Number(coordinates.latitude)];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;

    map.flyTo({
      center: point,
      zoom: 16,
      pitch: is3D ? 48 : 0,
      duration: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1200,
    });
    if (markerRef.current) markerRef.current.setLngLat(point);
    else markerRef.current = new Marker({ color: "#087b5a" }).setLngLat(point).addTo(map);
  }, [coordinates?.latitude, coordinates?.longitude, is3D]);

  return (
    <div
      ref={containerRef}
      className="location-map maplibre-fallback-canvas"
      aria-label="Peta cadangan untuk memilih lokasi laporan"
    />
  );
}
