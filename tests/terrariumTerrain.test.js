import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeTerrariumElevation,
  sampleTerrariumPixels,
  TERRARIUM_TILE_URL,
} from "../src/earth/terrariumTerrain.js";

test("decodes Terrarium RGB elevation values in metres", () => {
  assert.equal(decodeTerrariumElevation(128, 0, 0), 0);
  assert.equal(decodeTerrariumElevation(128, 1, 0), 1);
  assert.equal(decodeTerrariumElevation(127, 255, 0), -1);
  assert.equal(decodeTerrariumElevation(128, 0, 128), 0.5);
});

test("resamples a Terrarium raster into Cesium row-major heights", () => {
  const rgba = new Uint8ClampedArray([
    128, 0, 0, 255, 128, 1, 0, 255,
    128, 2, 0, 255, 128, 3, 0, 255,
  ]);

  assert.deepEqual(
    Array.from(sampleTerrariumPixels(rgba, 2, 2, 2, 2)),
    [0, 1, 2, 3]
  );
});

test("can sample a child tile crop from its cached parent raster", () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const offset = (row * 4 + column) * 4;
      rgba[offset] = 128;
      rgba[offset + 1] = row * 4 + column;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = 255;
    }
  }

  assert.deepEqual(
    Array.from(sampleTerrariumPixels(rgba, 4, 4, 2, 2, {
      x: 2, y: 0, width: 2, height: 2,
    })),
    [2, 3, 6, 7]
  );
});

test("uses the public AWS Terrarium tile endpoint without a token", () => {
  assert.match(TERRARIUM_TILE_URL, /elevation-tiles-prod\.s3\.amazonaws\.com/);
  assert.doesNotMatch(TERRARIUM_TILE_URL, /api[_-]?key|token/i);
});
