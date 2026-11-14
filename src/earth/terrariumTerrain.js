export const TERRARIUM_TILE_URL =
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

export const TERRARIUM_ATTRIBUTION =
  "Terrain Tiles (Mapzen / Tilezen); required source credits: https://github.com/tilezen/joerd/blob/master/docs/attribution.md";

export function decodeTerrariumElevation(red, green, blue) {
  return red * 256 + green + blue / 256 - 32768;
}

export function sampleTerrariumPixels(
  rgba,
  sourceWidth,
  sourceHeight,
  targetWidth = 65,
  targetHeight = 65,
  crop = { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
) {
  if (
    !rgba ||
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    !Number.isInteger(targetWidth) ||
    !Number.isInteger(targetHeight) ||
    targetWidth < 2 ||
    targetHeight < 2
  ) {
    throw new TypeError("Invalid Terrarium raster dimensions.");
  }

  const heights = new Float32Array(targetWidth * targetHeight);
  const maxX = Math.max(0, Math.min(sourceWidth - 1, crop.x + crop.width - 1));
  const maxY = Math.max(0, Math.min(sourceHeight - 1, crop.y + crop.height - 1));

  for (let row = 0; row < targetHeight; row += 1) {
    const sourceY = Math.max(
      0,
      Math.min(maxY, Math.round(crop.y + (row / (targetHeight - 1)) * (crop.height - 1)))
    );

    for (let column = 0; column < targetWidth; column += 1) {
      const sourceX = Math.max(
        0,
        Math.min(maxX, Math.round(crop.x + (column / (targetWidth - 1)) * (crop.width - 1)))
      );
      const offset = (sourceY * sourceWidth + sourceX) * 4;
      heights[row * targetWidth + column] = decodeTerrariumElevation(
        rgba[offset],
        rgba[offset + 1],
        rgba[offset + 2]
      );
    }
  }

  return heights;
}

/**
 * Creates real 3D terrain from public Mapzen/Terrain Tiles (Terrarium PNG).
 * The provider samples 256px source tiles into a 65x65 heightmap and reuses
 * the nearest available parent tile when Cesium requests levels above 14.
 */
export function createTerrariumTerrainProvider(
  Cesium,
  {
    tileSize = 65,
    maxSourceLevel = 14,
    maxCachedTiles = 48,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    onSourceError,
  } = {}
) {
  if (!Cesium?.CustomHeightmapTerrainProvider || !Cesium?.WebMercatorTilingScheme) {
    throw new TypeError("Cesium CustomHeightmapTerrainProvider is unavailable.");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Fetch is unavailable for public terrain tiles.");
  }

  const tileCache = new Map();

  async function loadPixels(level, x, y) {
    const sourceLevel = Math.min(level, maxSourceLevel);
    const scale = 2 ** (level - sourceLevel);
    const sourceX = Math.floor(x / scale);
    const sourceY = Math.floor(y / scale);
    const key = `${sourceLevel}/${sourceX}/${sourceY}`;

    let pixelsPromise = tileCache.get(key);
    if (!pixelsPromise) {
      pixelsPromise = (async () => {
        const url = TERRARIUM_TILE_URL
          .replace("{z}", String(sourceLevel))
          .replace("{x}", String(sourceX))
          .replace("{y}", String(sourceY));
        const response = await fetchImpl(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) {
          throw new Error(`Terrain tile HTTP ${response.status} at ${key}`);
        }

        const bitmap = await globalThis.createImageBitmap(await response.blob());
        try {
          const canvas = globalThis.document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas 2D context is unavailable.");
          context.drawImage(bitmap, 0, 0);
          return {
            data: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
            width: bitmap.width,
            height: bitmap.height,
          };
        } finally {
          bitmap.close?.();
        }
      })();

      tileCache.set(key, pixelsPromise);
      pixelsPromise.catch(() => {
        if (tileCache.get(key) === pixelsPromise) tileCache.delete(key);
      });
      if (tileCache.size > maxCachedTiles) {
        const oldestKey = tileCache.keys().next().value;
        if (oldestKey !== key) tileCache.delete(oldestKey);
      }
    }

    return pixelsPromise;
  }

  return new Cesium.CustomHeightmapTerrainProvider({
    width: tileSize,
    height: tileSize,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: TERRARIUM_ATTRIBUTION,
    callback: async (x, y, level) => {
      try {
        const source = await loadPixels(level, x, y);
        const scale = 2 ** (level - Math.min(level, maxSourceLevel));
        const column = x - Math.floor(x / scale) * scale;
        const row = y - Math.floor(y / scale) * scale;
        const crop = {
          x: (column / scale) * source.width,
          y: (row / scale) * source.height,
          width: source.width / scale,
          height: source.height / scale,
        };
        return sampleTerrariumPixels(
          source.data,
          source.width,
          source.height,
          tileSize,
          tileSize,
          crop
        );
      } catch (error) {
        onSourceError?.(error);
        // A failed tile is kept at sea level; the rest of the globe remains usable.
        return new Float32Array(tileSize * tileSize);
      }
    },
  });
}
