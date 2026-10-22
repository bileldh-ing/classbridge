import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GRAD, inter, mono } from "../theme";
import { clamp } from "./diagram";

export const OUTRO_FRAMES = 240;

export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 14, stiffness: 120 } });
  const b = spring({ frame: f - 18, fps, config: { damping: 200 } });
  const c = spring({ frame: f - 34, fps, config: { damping: 200 } });
  const end = interpolate(f, [OUTRO_FRAMES - 30, OUTRO_FRAMES], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: inter, opacity: end }}>
      <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -5, color: C.text, opacity: a, transform: `scale(${0.85 + 0.15 * a})` }}>
        Class<span style={{ backgroundImage: GRAD, WebkitBackgroundClip: "text", color: "transparent" }}>Bridge</span>
      </div>
      <div style={{ fontSize: 36, color: C.muted, marginTop: 6, opacity: b }}>Open source. Fully tested. Ready to ship.</div>
      <div style={{ marginTop: 50, display: "flex", alignItems: "center", gap: 18, padding: "22px 40px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(139,92,246,0.6)", boxShadow: "0 0 60px rgba(139,92,246,0.3)", opacity: c, transform: `translateY(${(1 - c) * 30}px)` }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ fontFamily: mono, fontSize: 44, fontWeight: 600, color: C.text }}>github.com/bileldh-ing/classbridge</span>
      </div>
      <div style={{ marginTop: 44, display: "flex", gap: 16, opacity: spring({ frame: f - 52, fps, config: { damping: 200 } }) }}>
        {["Star the repo", "Read the docs", "Run it with Docker"].map((x) => (
          <span key={x} style={{ fontSize: 24, fontWeight: 600, color: C.text, padding: "10px 22px", borderRadius: 12, background: C.panel, border: `1px solid ${C.border}` }}>{x}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
