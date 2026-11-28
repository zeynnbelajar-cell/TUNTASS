import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function TaskDashboard({ onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#fff" }}>
      <iframe
        title="Dashboard Keluhan Warga"
        src="/Dashboard%20Keluhan%20Warga.html"
        style={{ display: "block", width: "100%", height: "100%", border: 0 }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup dashboard"
        title="Tutup dashboard"
        style={{
          position: "absolute", top: 12, right: 14, zIndex: 2,
          width: 40, height: 40, display: "grid", placeItems: "center",
          border: "1px solid rgba(0,0,0,.14)", borderRadius: 12,
          background: "rgba(255,255,255,.92)", color: "#29231e",
          cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.12)"
        }}
      ><X size={19} /></button>
    </div>,
    document.body
  );
}
