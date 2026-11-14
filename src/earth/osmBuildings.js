export function parseBuildingHeight(tags = {}) {
  const explicit = String(tags.height || "").trim();
  const explicitMatch = explicit.match(/^(\d+(?:\.\d+)?)(\s*(?:m|metres?|meters?|ft|feet|'))?$/i);
  if (explicitMatch) {
    const value = Number(explicitMatch[1]);
    const unit = (explicitMatch[2] || "").trim().toLowerCase();
    const meters = unit === "ft" || unit === "feet" || unit === "'" ? value * 0.3048 : value;
    if (Number.isFinite(meters) && meters > 0) return Math.min(Math.max(meters, 3), 120);
  }

  const levels = Number.parseFloat(String(tags["building:levels"] || ""));
  if (Number.isFinite(levels) && levels > 0) return Math.min(Math.max(levels * 3.2, 3), 120);
  return 8;
}

export function getBuildingRing(element) {
  const geometry = Array.isArray(element?.geometry) ? element.geometry : [];
  const ring = geometry
    .map((point) => ({ latitude: Number(point?.lat), longitude: Number(point?.lon) }))
    .filter((point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      point.latitude >= -90 && point.latitude <= 90 &&
      point.longitude >= -180 && point.longitude <= 180
    );

  if (ring.length < 4) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) ring.push(first);
  return ring;
}

export function buildOverpassQuery(bounds) {
  const values = [bounds?.south, bounds?.west, bounds?.north, bounds?.east].map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("Batas area OpenStreetMap tidak valid.");
  }
  const [south, west, north, east] = values;
  return `[out:json][timeout:18];way["building"](${south},${west},${north},${east});out geom 180;`;
}
