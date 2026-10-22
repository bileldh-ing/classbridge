import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CHAPTERS } from "../config";
import { C, GRAD, inter, mono } from "../theme";

export const CARD_FRAMES = 78;

export const ChapterCard: React.FC<{ index: number }> = ({ index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ch = CHAPTERS[index];
  const num = String(index + 1).padStart(2, "0");
  const s = spring({ frame: f, fps, config: { damping: 15, stiffness: 140 } });
  const line = interpolate(f, [6, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sub = spring({ frame: f - 14, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: inter }}>
      <div style={{ position: "absolute", fontSize: 560, fontWeight: 900, color: "transparent", WebkitTextStroke: "2px rgba(255,255,255,0.07)", letterSpacing: -20, transform: `translateX(${interpolate(f, [0, CARD_FRAMES], [60, -60])}px)` }}>{num}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: 6, color: C.teal, opacity: s }}>CHAPTER {num}</div>
        <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -5, color: C.text, transform: `translateY(${(1 - s) * 80}px) scale(${0.9 + 0.1 * s})`, opacity: Math.min(1, s * 1.5), lineHeight: 1.05 }}>{ch.title}</div>
        <div style={{ height: 6, width: 300, borderRadius: 3, background: GRAD, transform: `scaleX(${line})`, margin: "18px 0 22px" }} />
        <div style={{ fontSize: 38, fontWeight: 500, color: C.muted, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>{ch.subtitle}</div>
      </div>
      <div style={{ position: "absolute", bottom: 70, display: "flex", gap: 12 }}>
        {CHAPTERS.map((c, i) => (
          <div key={c.key} style={{ width: i === index ? 46 : 12, height: 12, borderRadius: 6, background: i === index ? GRAD : i < index ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
