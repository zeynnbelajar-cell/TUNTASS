import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBuildingHeight,
  getBuildingRing,
  buildOverpassQuery,
} from "../src/earth/osmBuildings.js";

test("uses explicit building height before level estimates", () => {
  assert.equal(parseBuildingHeight({ height: "12 m", "building:levels": "5" }), 12);
});

test("estimates building height from OSM levels", () => {
  assert.equal(parseBuildingHeight({ "building:levels": "4" }), 12.8);
});

test("returns a bounded fallback when OSM has no height", () => {
  assert.equal(parseBuildingHeight({ building: "yes" }), 8);
});

test("accepts only closed polygon rings with enough points", () => {
  assert.equal(getBuildingRing({ geometry: [{lat:0,lon:0},{lat:0,lon:1},{lat:1,lon:1},{lat:0,lon:0}] }).length, 4);
  assert.equal(getBuildingRing({ geometry: [{lat:0,lon:0},{lat:1,lon:1}] }).length, 0);
});

test("builds a bounded Overpass building query", () => {
  const query = buildOverpassQuery({ south: -6.1, west: 106.7, north: -6.0, east: 106.8 });
  assert.match(query, /way\["building"\]/);
  assert.match(query, /out geom 180/);
});
