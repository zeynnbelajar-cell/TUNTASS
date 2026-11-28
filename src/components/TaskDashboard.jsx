import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function TaskDashboard({ onClose, profile, user, embedded = false }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (embedded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [embedded]);

  const sendVolunteerProfile = useCallback(() => {
    const metadata = user?.user_metadata || {};
    const fullName =
      profile?.full_name?.trim() ||
      metadata.full_name?.trim?.() ||
      metadata.name?.trim?.() ||
      metadata.display_name?.trim?.() ||
      user?.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
      "Relawan";

    iframeRef.current?.contentWindow?.postMessage({
      type: "TUNTAS_VOLUNTEER_PROFILE",
      payload: {
        fullName,
        skills: profile?.skills?.trim() || "",
        area: profile?.area?.trim() || "",
        avatarUrl: profile?.avatar_url || metadata.avatar_url || metadata.picture || "",
      },
    }, window.location.origin);
  }, [profile, user]);

  useEffect(() => {
    sendVolunteerProfile();
  }, [sendVolunteerProfile]);

  const dashboardFrame = (
    <iframe
      ref={iframeRef}
      title="Dashboard Portofolio Relawan"
      src={import.meta.env.BASE_URL + "Dashboard%20Keluhan%20Warga.html"}
      onLoad={sendVolunteerProfile}
      style={{ display: "block", width: "100%", height: "min(76vh, 820px)", minHeight: 560, border: 0, background: "#fff" }}
    />
  );

  if (embedded) {
    return (
      <div className="volunteer-portfolio-dashboard-frame" style={{ width: "100%", overflow: "hidden", borderRadius: 16, background: "#fff" }}>
        {dashboardFrame}
      </div>
    );
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#fff" }}>
      {dashboardFrame}
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
