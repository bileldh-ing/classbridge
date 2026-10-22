import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, inter, mono } from "../theme";

export const STACK_FRAMES = 180;
const STACK = [
  { name: "Next.js 16", mono: "N", color: "#ffffff", fg: "#000", note: "App Router · React 19" },
  { name: "TypeScript", mono: "TS", color: "#3178c6", fg: "#fff", note: "strict mode" },
  { name: "PostgreSQL", mono: "PG", color: "#336791", fg: "#fff", note: "v17 · constraints · NOTIFY" },
  { name: "Drizzle ORM", mono: "D", color: "#c5f74f", fg: "#111", note: "typed SQL · migrations" },
  { name: "Tailwind CSS", mono: "TW", color: "#38bdf8", fg: "#0b1120", note: "v4 · RTL-aware" },
  { name: "Playwright", mono: "PW", color: "#2ead33", fg: "#fff", note: "e2e + this demo" },
  { name: "Docker", mono: "DK", color: "#2496ed", fg: "#fff", note: "standalone image" },
  { name: "GitHub Actions", mono: "GA", color: "#2088ff", fg: "#fff", note: "CI · CD · mobile builds" },
  { name: "Capacitor", mono: "CAP", color: "#119eff", fg: "#fff", note: "Android + iOS" },
];

export const TechStack: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = spring({ frame: f, fps, config: { damping: 200 } });
  const exit = interpolate(f, [STACK_FRAMES - 12, STACK_FRAMES], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: inter, opacity: exit }}>
      <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: 4, color: C.teal, opacity: title }}>TECH STACK</div>
      <div style={{ fontSize: 72, fontWeight: 900, color: C.text, letterSpacing: -2, marginTop: 8, opacity: title, transform: `translateY(${(1 - title) * 30}px)` }}>Built with a modern, typed stack</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 470px)", gap: 26, marginTop: 56 }}>
        {STACK.map((s, i) => {
          const p = spring({ frame: f - 14 - i * 5, fps, config: { damping: 13, stiffness: 170 } });
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px 24px", borderRadius: 18, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, boxShadow: `0 20px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)`, opacity: Math.min(1, p * 1.3), transform: `scale(${0.6 + 0.4 * p}) translateY(${(1 - p) * 40}px)` }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: s.color, color: s.fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: s.mono.length > 2 ? 20 : 26, boxShadow: `0 0 30px ${s.color}55` }}>{s.mono}</div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: C.text }}>{s.name}</div>
                <div style={{ fontFamily: mono, fontSize: 17, color: C.muted, marginTop: 4 }}>{s.note}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
