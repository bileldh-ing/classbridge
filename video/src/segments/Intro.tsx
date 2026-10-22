import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, GRAD, inter, mono } from "../theme";

const HOOK = ["One", "codebase.", "Students,", "teachers,", "admins."];

export const INTRO_FRAMES = 225;

/** Kinetic hook (0-80) then the title reveal (80-225). */
export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hookOut = interpolate(f, [70, 84], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const t = f - 80;
  const letters = "ClassBridge".split("");
  const bar = interpolate(t, [28, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const tagWords = ["the", "full-stack", "learning", "marketplace"];
  const exit = interpolate(f, [INTRO_FRAMES - 14, INTRO_FRAMES], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: inter }}>
      {f < 86 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: hookOut, transform: `scale(${1 + f * 0.0015})` }}>
          {[HOOK.slice(0, 2), HOOK.slice(2)].map((row, r) => (
            <div key={r} style={{ display: "flex", gap: 28 }}>
              {row.map((w, j) => {
                const i = r * 2 + j;
                const s = spring({ frame: f - i * 9, fps, config: { damping: 14, stiffness: 160 } });
                return (
                  <span key={w} style={{ fontSize: 104, fontWeight: 900, color: r === 0 ? C.text : "transparent", backgroundImage: r === 0 ? undefined : GRAD, WebkitBackgroundClip: r === 0 ? undefined : "text", letterSpacing: -3, opacity: s, transform: `translateY(${(1 - s) * 60}px)`, filter: `blur(${(1 - s) * 10}px)` }}>{w}</span>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {t >= 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: exit, transform: `scale(${interpolate(t, [0, 145], [1.04, 1])})` }}>
          <div style={{ display: "flex" }}>
            {letters.map((l, i) => {
              const s = spring({ frame: t - i * 2.2, fps, config: { damping: 12, stiffness: 180 } });
              return (
                <span key={i} style={{ fontSize: 190, fontWeight: 900, letterSpacing: -6, color: i < 5 ? C.text : "transparent", backgroundImage: i < 5 ? undefined : GRAD, WebkitBackgroundClip: i < 5 ? undefined : "text", display: "inline-block", opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 120}px) rotate(${(1 - s) * 8}deg)` }}>{l}</span>
              );
            })}
          </div>
          <div style={{ height: 8, width: 980, borderRadius: 4, background: GRAD, transform: `scaleX(${bar})`, marginTop: 6, boxShadow: "0 0 40px rgba(139,92,246,0.6)" }} />
          <div style={{ display: "flex", gap: 18, marginTop: 34, alignItems: "center" }}>
            <span style={{ fontSize: 52, fontWeight: 300, color: C.muted, opacity: interpolate(t, [40, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>—</span>
            {tagWords.map((w, i) => {
              const s = spring({ frame: t - 44 - i * 6, fps, config: { damping: 200 } });
              return <span key={w} style={{ fontSize: 52, fontWeight: 600, color: C.text, opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>{w}</span>;
            })}
          </div>
          <div style={{ marginTop: 40, display: "flex", gap: 14, opacity: spring({ frame: t - 80, fps, config: { damping: 200 } }) }}>
            {["Search", "Book", "Learn", "Teach", "Admin"].map((x) => (
              <span key={x} style={{ fontFamily: mono, fontSize: 22, color: C.muted, padding: "8px 18px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.panel }}>{x}</span>
            ))}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
