import React from "react";
import { inter } from "../theme";

/** Phone mockup: bezel, status bar with dynamic island, then the screen content (width x height). */
export const PhoneFrame: React.FC<{ width: number; height: number; children: React.ReactNode }> = ({ width, height, children }) => (
  <div style={{
    padding: 14, borderRadius: 62, background: "linear-gradient(145deg, #2c2f3d, #0d0f16)",
    boxShadow: "0 50px 120px rgba(0,0,0,0.65), inset 0 0 0 2px rgba(255,255,255,0.08), 0 0 90px rgba(59,130,246,0.25)",
  }}>
    <div style={{ width, borderRadius: 50, overflow: "hidden", background: "#fff" }}>
      <div style={{ height: 48, position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontFamily: inter, fontWeight: 600, fontSize: 17, color: "#111" }}>
        <span>9:41</span>
        <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", width: 118, height: 32, borderRadius: 18, background: "#000" }} />
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>{[7, 10, 13, 16].map((h) => <div key={h} style={{ width: 4, height: h, borderRadius: 1, background: "#111" }} />)}<div style={{ width: 26, height: 13, borderRadius: 4, border: "2px solid #111", marginLeft: 6, padding: 1 }}><div style={{ width: "75%", height: "100%", background: "#111", borderRadius: 1 }} /></div></div>
      </div>
      <div style={{ width, height, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  </div>
);
