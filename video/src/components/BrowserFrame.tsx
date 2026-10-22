import React from "react";
import { C, mono } from "../theme";

export const FRAME = { width: 1536, bar: 44 };

export const BrowserFrame: React.FC<{ url: string; children: React.ReactNode; width?: number }> = ({ url, children, width = FRAME.width }) => {
  const h = (width * 9) / 16;
  return (
    <div style={{
      width, borderRadius: 16, overflow: "hidden", background: "#11131c", border: `1px solid ${C.border}`,
      boxShadow: "0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), 0 0 80px rgba(139,92,246,0.18)",
    }}>
      <div style={{ height: FRAME.bar, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "linear-gradient(#1c1f2b, #161924)", borderBottom: `1px solid ${C.border}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ minWidth: 520, maxWidth: 900, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", color: C.muted, fontFamily: mono, fontSize: 15 }}>
            <svg width="14" height="14" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill={C.green} /><path d="M8 10V7a4 4 0 018 0v3" stroke={C.green} strokeWidth="2.5" fill="none" /></svg>
            <span style={{ color: "#d6d8ee" }}>classbridge.app</span><span>{url === "/" ? "" : url}</span>
          </div>
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ width, height: h, position: "relative", overflow: "hidden", background: "#fff" }}>{children}</div>
    </div>
  );
};
