import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "node:path";

const base = "/TUNTASS/";
const cesiumBuild = normalizePath(path.resolve("node_modules/cesium/Build/Cesium"));
const cesiumDirectories = ["Assets", "ThirdParty", "Workers", "Widgets"];

export default defineConfig({
  base,
  plugins: [
    react(),
    viteStaticCopy({
      targets: cesiumDirectories.map((directory) => ({
        src: `${cesiumBuild}/${directory}/**/*`,
        dest: `cesium/${directory}`,
        rename: { stripBase: 5 },
      })),
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
  },
});
