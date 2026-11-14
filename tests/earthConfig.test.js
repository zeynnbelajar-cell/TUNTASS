import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCoordinates,
  getCameraFlightProfile,
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
