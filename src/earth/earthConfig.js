export function normalizeCoordinates(value) {
  if (!value) return null;

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function getCameraFlightProfile({ source = "manual", reducedMotion = false } = {}) {
  const profile = source === "gps"
    ? { duration: 4.2, range: 1800, pitchDegrees: -48 }
    : source === "search"
      ? { duration: 2.6, range: 2800, pitchDegrees: -52 }
      : { duration: 1.8, range: 2200, pitchDegrees: -55 };

  return reducedMotion ? { ...profile, duration: 0 } : profile;
}

export function getOverpassBounds(coordinates, radiusMeters = 900) {
  const point = normalizeCoordinates(coordinates);
  if (!point || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;

  const latitudeDelta = radiusMeters / 111320;
  const longitudeScale = Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.15);
  const longitudeDelta = radiusMeters / (111320 * longitudeScale);

  return {
    south: point.latitude - latitudeDelta,
    west: point.longitude - longitudeDelta,
    north: point.latitude + latitudeDelta,
    east: point.longitude + longitudeDelta,
  };
}
