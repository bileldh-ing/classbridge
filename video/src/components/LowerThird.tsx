import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GRAD, inter, mono } from "../theme";

/** Animated lower-third: chapter tag + feature title + one-line explanation. */
export const LowerThird: React.FC<{ tag: string; title: string; text: string; durationInFrames: number; left?: number; top?: number; maxWidth?: number }> = ({ tag, title, text, durationInFrames, left = 192, top = 946, maxWidth = 1536 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f - 12, fps, config: { damping: 200 } });
  const outP = interpolate(f, [durationInFrames - 22, durationInFrames - 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = inP * (1 - outP);
  const textP = spring({ frame: f - 22, fps, config: { damping: 200 } }) * (1 - outP);
  return (
    <div style={{ position: "absolute", left, top, maxWidth, display: "flex", alignItems: "stretch", gap: 18, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ width: 6, borderRadius: 3, background: GRAD, transform: `scaleY(${p})`, transformOrigin: "top" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 17, letterSpacing: 2, color: C.teal, textTransform: "uppercase" }}>{tag}</span>
          <span style={{ fontFamily: inter, fontWeight: 800, fontSize: 34, color: C.text, letterSpacing: -0.5 }}>{title}</span>
        </div>
        <div style={{ fontFamily: inter, fontWeight: 500, fontSize: 24, color: C.muted, opacity: textP, transform: `translateX(${(1 - textP) * 20}px)`, whiteSpace: "nowrap" }}>{text}</div>
      </div>
    </div>
  );
};
