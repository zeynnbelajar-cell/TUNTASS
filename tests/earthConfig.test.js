import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCoordinates,
  getCameraFlightProfile,
  getGlobePerformanceProfile,
} from "../src/earth/earthConfig.js";

test("normalizes numeric WGS84 coordinates", () => {
  assert.deepEqual(
    normalizeCoordinates({ latitude: "-6.2", longitude: "106.8" }),
    { latitude: -6.2, longitude: 106.8 }
  );
});

test("rejects coordinates outside WGS84 bounds", () => {
  assert.equal(normalizeCoordinates({ latitude: 91, longitude: 106 }), null);
  assert.equal(normalizeCoordinates({ latitude: -6, longitude: 181 }), null);
  assert.equal(normalizeCoordinates(null), null);
});

test("GPS camera profile uses a longer cinematic flight", () => {
  const profile = getCameraFlightProfile({ source: "gps", reducedMotion: false });
  assert.equal(profile.duration, 4.2);
  assert.equal(profile.range, 1800);
  assert.equal(profile.pitchDegrees, -48);
});

test("reduced motion removes camera travel", () => {
  const profile = getCameraFlightProfile({ source: "gps", reducedMotion: true });
  assert.equal(profile.duration, 0);
  assert.equal(profile.range, 1800);
});

test("constrained globe profile limits rendering and tile memory", () => {
  const profile = getGlobePerformanceProfile({
    deviceMemory: 4,
    hardwareConcurrency: 8,
  });

  assert.equal(profile.constrained, true);
  assert.equal(profile.targetFrameRate, 30);
  assert.equal(profile.resolutionScale, 0.85);
  assert.equal(profile.maximumScreenSpaceError, 6);
  assert.equal(profile.tileCacheSize, 32);
});

test("standard globe profile uses balanced render settings", () => {
  const profile = getGlobePerformanceProfile({
    deviceMemory: 8,
    hardwareConcurrency: 8,
  });

  assert.equal(profile.constrained, false);
  assert.equal(profile.targetFrameRate, 45);
  assert.equal(profile.resolutionScale, 1);
  assert.equal(profile.maximumScreenSpaceError, 4);
  assert.equal(profile.tileCacheSize, 48);
});

test("unknown device capabilities use a conservative standard profile", () => {
  const profile = getGlobePerformanceProfile();
  assert.equal(profile.constrained, false);
  assert.equal(profile.targetFrameRate, 45);
  assert.equal(profile.resolutionScale, 1);
});
