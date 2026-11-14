import test from "node:test";
import assert from "node:assert/strict";
import { createTerrariumTerrainProvider } from "../src/earth/terrariumTerrain.js";

function installCanvasMocks(width, height, data) {
  const previousDocument = globalThis.document;
  const previousCreateImageBitmap = globalThis.createImageBitmap;

  globalThis.createImageBitmap = async () => ({
    width,
    height,
    close() {},
  });
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              return { data };
            },
          };
        },
      };
    },
  };

  return () => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousCreateImageBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previousCreateImageBitmap;
  };
}

function mockCesium() {
  return {
    WebMercatorTilingScheme: class WebMercatorTilingScheme {},
    CustomHeightmapTerrainProvider: class CustomHeightmapTerrainProvider {
      constructor(options) {
        this.options = options;
      }
    },
  };
}

test("terrain provider loads a public tile and returns a decoded Float32 heightmap", async () => {
  const data = new Uint8ClampedArray([
    128, 0, 0, 255, 128, 1, 0, 255,
    128, 2, 0, 255, 128, 3, 0, 255,
  ]);
  const restore = installCanvasMocks(2, 2, data);
  const urls = [];

  try {
    const provider = createTerrariumTerrainProvider(mockCesium(), {
      tileSize: 2,
      fetchImpl: async (url) => {
        urls.push(url);
        return { ok: true, blob: async () => ({}) };
      },
    });

    const heights = await provider.options.callback(0, 0, 0);
    assert.ok(heights instanceof Float32Array);
    assert.deepEqual(Array.from(heights), [0, 1, 2, 3]);
    assert.deepEqual(urls, [
      "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/0/0/0.png",
    ]);
  } finally {
    restore();
  }
});

test("terrain provider reuses a parent tile and crops the correct child quadrant", async () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const offset = (row * 4 + column) * 4;
      data[offset] = 128;
      data[offset + 1] = row * 4 + column;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }
  const restore = installCanvasMocks(4, 4, data);
  const urls = [];

  try {
    const provider = createTerrariumTerrainProvider(mockCesium(), {
      tileSize: 2,
      maxSourceLevel: 0,
      fetchImpl: async (url) => {
        urls.push(url);
        return { ok: true, blob: async () => ({}) };
      },
    });

    const heights = await provider.options.callback(1, 0, 1);
    assert.deepEqual(Array.from(heights), [2, 3, 6, 7]);
    assert.deepEqual(urls, [
      "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/0/0/0.png",
    ]);
  } finally {
    restore();
  }
});
