import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ZoomGridBackground from "./components/ZoomGridBackground.jsx";
import "./style.css";
import "./components/maplibre-overrides.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ZoomGridBackground />
    <div className="tuntas-app-layer"><App /></div>
  </React.StrictMode>
);