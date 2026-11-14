import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");
const entry = env.split(/\r?\n/).find((line) => line.startsWith("VITE_GEOAPIFY_API_KEY="));
const apiKey = entry?.slice("VITE_GEOAPIFY_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
if (!apiKey) {
  console.log("Geoapify API key not found.");
  process.exit(1);
}

const url = new URL("https://maps.geoapify.com/v1/styles/osm-bright/style.json");
url.searchParams.set("apiKey", apiKey);
const response = await fetch(url);
if (!response.ok) {
  console.log("Style request failed:", response.status, response.statusText);
  process.exit(1);
}
const style = await response.json();
const layers = (style.layers || []).map((layer) => ({
  id: layer.id,
  type: layer.type,
  source: layer.source,
  sourceLayer: layer["source-layer"],
  filter: layer.filter,
  paint: layer.paint
}));
const source = style.sources?.default || {};
console.log(JSON.stringify({
  status: response.status,
  sourceIds: Object.keys(style.sources || {}),
  source: { type: source.type, url: source.url?.replace(/\\?.*$/, ""), tileCount: source.tiles?.length, tileSample: source.tiles?.[0]?.replace(/\\?.*$/, "") },
  layers: layers.filter((layer) => /building|tree|forest|landcover|park|grass|wood|landuse/i.test([layer.id, layer.sourceLayer].filter(Boolean).join(" ")))
}, null, 2));
