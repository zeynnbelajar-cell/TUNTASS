import React, { useEffect, useRef, useState } from "react";
import { Compass, Minus, Plus } from "lucide-react";
import {
  getCameraFlightProfile,
  getOverpassBounds,
  normalizeCoordinates,
} from "../earth/earthConfig";
import {
  buildOverpassQuery,
  getBuildingRing,
  parseBuildingHeight,
} from "../earth/osmBuildings";
import {
  createTerrariumTerrainProvider,
  TERRARIUM_ATTRIBUTION,
} from "../earth/terrariumTerrain";
import {
  getOverpassFailureMessage,
  requestOverpassBuildings,
} from "../earth/overpassRequest";
import "./cesium-earth.css";

const DEFAULT_CENTER = { longitude: 118, latitude: -2.5, height: 25_000_000 };
const BLUE_MARBLE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";
const SENTINEL_2_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
const SENTINEL_2_ATTRIBUTION =
  "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)";

export default function CesiumEarthMap({
  coordinates,
  source = "manual",
  reports = [],
  viewMode = "globe",
  onPick,
  onError,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cesiumRef = useRef(null);
  const selectedEntityRef = useRef(null);
  const reportEntityIdsRef = useRef([]);
  const buildingEntityIdsRef = useRef([]);
  const buildingControllerRef = useRef(null);
  const previousPointRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = { onPick, onError };
  const [ready, setReady] = useState(false);
  const [buildingMessage, setBuildingMessage] = useState("");
  const [imageryMessage, setImageryMessage] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [networkRevision, setNetworkRevision] = useState(0);

  useEffect(() => {
    const retryOptionalLayers = () => setNetworkRevision((revision) => revision + 1);
    window.addEventListener("online", retryOptionalLayers);
    return () => window.removeEventListener("online", retryOptionalLayers);
  }, []);

  useEffect(() => {
    let disposed = false;
    let viewer;
    let clickHandler;

    async function createViewer() {
      try {
        window.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;
        const Cesium = await import("cesium");
        if (disposed || !containerRef.current) return;

        cesiumRef.current = Cesium;
        const terrainProvider = createTerrariumTerrainProvider(Cesium, {
          onSourceError: (error) => {
            console.warn("TUNTAS terrain tile error:", error);
          },
        });

        viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,
          terrainProvider,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          scene3DOnly: true,
          shouldAnimate: true,
          requestRenderMode: false,
          contextOptions: {
            webgl: {
              alpha: false,
              antialias: true,
              powerPreference: "high-performance",
            },
          },
        });

        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.dynamicAtmosphereLighting = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#071824");
        viewer.scene.globe.showWaterEffect = false;
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#020b18");
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;

        const blueMarbleProvider = new Cesium.UrlTemplateImageryProvider({
          url: BLUE_MARBLE_URL,
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
          minimumLevel: 0,
          maximumLevel: 8,
          credit: "NASA EOSDIS Global Imagery Browse Services (GIBS)",
        });
        const blueMarbleLayer = viewer.imageryLayers.addImageryProvider(blueMarbleProvider);
        blueMarbleLayer.errorEvent.addEventListener((error) => {
          console.warn("NASA GIBS fallback imagery tile error:", error);
        });

        const sentinelProvider = new Cesium.UrlTemplateImageryProvider({
          url: SENTINEL_2_URL,
          tilingScheme: new Cesium.WebMercatorTilingScheme(),
          minimumLevel: 0,
          maximumLevel: 14,
          credit: SENTINEL_2_ATTRIBUTION,
        });
        const sentinelLayer = viewer.imageryLayers.addImageryProvider(sentinelProvider);
        let sentinelTileErrors = 0;
        let sentinelFallbackActivated = false;
        sentinelLayer.errorEvent.addEventListener((error) => {
          sentinelTileErrors += 1;
          console.warn("EOxCloudless Sentinel-2 imagery tile error:", error);
          if (sentinelTileErrors >= 4 && !sentinelFallbackActivated) {
            sentinelFallbackActivated = true;
            viewer.imageryLayers.remove(sentinelLayer, true);
            setImageryMessage(
              "Citra Sentinel-2 sedang tidak tersedia. TUNTAS memakai citra global NASA."
            );
          }
        });

        terrainProvider.errorEvent.addEventListener((error) => {
          console.warn("TUNTAS terrain provider:", error);
        });

        viewer.scene.globe.show = true;
        viewer.scene.globe.showGroundAtmosphere = true;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            DEFAULT_CENTER.longitude,
            DEFAULT_CENTER.latitude,
            DEFAULT_CENTER.height
          ),
        });

        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          const pickedId = picked?.id?.id || picked?.id;
          if (typeof pickedId === "string" && pickedId.startsWith("tuntas-report:")) return;

          const cartesian = viewer.camera.pickEllipsoid(
            movement.position,
            viewer.scene.globe.ellipsoid
          );
          if (!cartesian) return;

          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          callbacksRef.current.onPick?.({
            latitude: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
            longitude: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
          });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewer.scene.canvas.style.cursor = "crosshair";
        viewerRef.current = viewer;
        setReady(true);
        setViewerError("");
      } catch (error) {
        if (!disposed) {
          const message = error?.message || "CesiumJS gagal diinisialisasi.";
          setViewerError(message);
          callbacksRef.current.onError?.(message);
        }
      }
    }

    createViewer();

    return () => {
      disposed = true;
      buildingControllerRef.current?.abort();
      if (clickHandler && !clickHandler.isDestroyed()) clickHandler.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      cesiumRef.current = null;
      selectedEntityRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    for (const id of reportEntityIdsRef.current) viewer.entities.removeById(id);
    reportEntityIdsRef.current = [];

    for (const report of reports || []) {
      const point = normalizeCoordinates({
        latitude: report.latitude,
        longitude: report.longitude,
      });
      if (!point) continue;

      const id = `tuntas-report:${report.id}`;
      viewer.entities.add({
        id,
        name: `${report.category || "Laporan"} · ${report.priority || "Prioritas belum ditentukan"}`,
        position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 35),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#e45d42"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 1_000_000,
        },
      });
      reportEntityIdsRef.current.push(id);
    }
  }, [reports, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    const point = normalizeCoordinates(coordinates);
    if (!point) {
      if (selectedEntityRef.current) {
        viewer.entities.remove(selectedEntityRef.current);
        selectedEntityRef.current = null;
      }
      previousPointRef.current = null;
      return;
    }

    const previous = previousPointRef.current;
    if (previous?.latitude === point.latitude && previous?.longitude === point.longitude) return;
    previousPointRef.current = point;

    if (selectedEntityRef.current) viewer.entities.remove(selectedEntityRef.current);
    selectedEntityRef.current = viewer.entities.add({
      name: "Lokasi laporan dipilih",
      position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 30),
      point: {
        pixelSize: 15,
        color: Cesium.Color.fromCssColorString("#0fbd85"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 1_000_000,
      },
    });

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const profile = getCameraFlightProfile({ source, reducedMotion });
    const destination = Cesium.Cartesian3.fromDegrees(
      point.longitude,
      point.latitude,
      profile.range
    );
    const orientation = {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(profile.pitchDegrees),
      roll: 0,
    };

    if (profile.duration === 0) {
      viewer.camera.setView({ destination, orientation });
    } else {
      viewer.camera.flyTo({
        destination,
        orientation,
        duration: profile.duration,
        maximumHeight: 28_000_000,
      });
    }
  }, [coordinates?.latitude, coordinates?.longitude, source, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !ready) return;

    if (viewMode === "globe") {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          DEFAULT_CENTER.longitude,
          DEFAULT_CENTER.latitude,
          DEFAULT_CENTER.height
        ),
        duration: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1.8,
      });
    }
  }, [viewMode, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const point = normalizeCoordinates(coordinates);
    if (!viewer || !Cesium || !ready || !point || source === "manual") return undefined;

    buildingControllerRef.current?.abort();
    const controller = new AbortController();
    buildingControllerRef.current = controller;

    for (const id of buildingEntityIdsRef.current) viewer.entities.removeById(id);
    buildingEntityIdsRef.current = [];
    setBuildingMessage("Memuat jejak bangunan OpenStreetMap...");

    async function loadBuildings() {
      const bounds = getOverpassBounds(point, 900);
      if (!bounds) return;
      const query = buildOverpassQuery(bounds);

      try {
        const response = await requestOverpassBuildings(query, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return;

        let added = 0;
        for (const way of payload.elements || []) {
          const ring = getBuildingRing(way);
          if (!ring.length) continue;

          const id = `tuntas-osm-building:${way.id}`;
          const positions = ring.flatMap((entry) => [entry.longitude, entry.latitude]);
          viewer.entities.add({
            id,
            name: way.tags?.name || "Bangunan OpenStreetMap",
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
              height: 0,
              extrudedHeight: parseBuildingHeight(way.tags),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              material: Cesium.Color.fromCssColorString("#aabfcd").withAlpha(0.9),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#edf5f8").withAlpha(0.45),
              closeTop: true,
              closeBottom: true,
            },
          });
          buildingEntityIdsRef.current.push(id);
          added += 1;
        }

        setBuildingMessage(
          added > 0
            ? `${added} bangunan 3D dari OpenStreetMap`
            : "Belum ada jejak bangunan OSM di area ini."
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          setBuildingMessage(getOverpassFailureMessage(error));
        }
      }
    }

    loadBuildings();
    return () => controller.abort();
  }, [coordinates?.latitude, coordinates?.longitude, source, ready, networkRevision]);

  function zoomBy(factor) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const amount = Math.max(150, viewer.camera.positionCartographic.height * 0.28);
    if (factor < 0) viewer.camera.zoomIn(amount);
    else viewer.camera.zoomOut(amount);
  }

  function resetNorth() {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    const current = viewer.camera.positionCartographic;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(current.longitude, current.latitude, current.height),
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.45,
    });
  }

  return (
    <div className="cesium-earth-root">
      <div ref={containerRef} className="cesium-earth-canvas" aria-label="Globe bumi TUNTAS interaktif" />
      {!ready && !viewerError && (
        <div className="cesium-loading" role="status">
          <span className="cesium-loading-orbit" />
          <strong>Menyiapkan TUNTAS Earth</strong>
          <small>Memuat globe dan citra bumi</small>
        </div>
      )}
      <div className="cesium-earth-controls" aria-label="Kontrol globe">
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Perbesar peta"><Plus size={17} /></button>
        <button type="button" onClick={() => zoomBy(1)} aria-label="Perkecil peta"><Minus size={17} /></button>
        <button type="button" onClick={resetNorth} aria-label="Arahkan utara"><Compass size={17} /></button>
      </div>
      <div className="cesium-data-credit">
        <span>EOxCloudless · modified Copernicus Sentinel-2 2025</span>
        <span>{TERRARIUM_ATTRIBUTION}</span>
        <span>NASA EOSDIS GIBS fallback · © OpenStreetMap contributors</span>
      </div>
      {imageryMessage && (
        <div className="cesium-imagery-status" role="status">{imageryMessage}</div>
      )}
      {buildingMessage && (
        <div className="cesium-building-status" role="status">{buildingMessage}</div>
      )}
      {viewerError && (
        <div className="cesium-viewer-error" role="alert">{viewerError}</div>
      )}
    </div>
  );
}
