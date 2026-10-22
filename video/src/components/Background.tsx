import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";

/** Dark JSM-style backdrop: slow drifting colour glows + a faint grid. */
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const a = f / 30;
  const blob = (x: number, y: number, size: number, color: string, op: number): React.CSSProperties => ({
    position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 65%)`, opacity: op, filter: "blur(40px)",
  });
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={blob(400 + Math.sin(a * 0.21) * 160, 250 + Math.cos(a * 0.17) * 90, 1100, C.purple, 0.38)} />
      <div style={blob(1550 + Math.cos(a * 0.15) * 140, 820 + Math.sin(a * 0.19) * 100, 1200, C.blue, 0.32)} />
      <div style={blob(1100 + Math.sin(a * 0.11) * 220, 120 + Math.cos(a * 0.13) * 60, 800, C.teal, 0.18)} />
      <AbsoluteFill style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "64px 64px", backgroundPosition: `${interpolate(f, [0, 3000], [0, 64]) % 64}px 0px`,
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
      }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
