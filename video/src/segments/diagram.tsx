import React from "react";
import { Easing, interpolate } from "remotion";
import { C, inter, mono } from "../theme";
import { Check } from "../components/Check";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A path that draws itself between frames [from, from+dur]. */
export const DrawPath: React.FC<{ d: string; f: number; from: number; dur?: number; color?: string; width?: number }> = ({ d, f, from, dur = 18, color = "rgba(139,92,246,0.75)", width = 2.5 }) => {
  const p = interpolate(f, [from, from + dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return <path d={d} stroke={color} strokeWidth={width} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} strokeLinecap="round" />;
};

export const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

/** Pipeline/architecture node: pops in at `appear`, shows a spinner, then turns green at `done` (if given). */
export const Node: React.FC<{ x: number; y: number; w: number; h: number; title: string; sub?: string; f: number; appear: number; done?: number; accent?: string }> = ({ x, y, w, h, title, sub, f, appear, done, accent = C.purple }) => {
  const p = interpolate(f, [appear, appear + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const ok = done !== undefined && f >= done;
  const okP = done !== undefined ? interpolate(f, [done, done + 8], [0, 1], clamp) : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 14, display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
      background: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))`, border: `1px solid ${ok ? "rgba(34,197,94,0.55)" : C.border}`,
      boxShadow: ok ? "0 0 30px rgba(34,197,94,0.18), 0 14px 40px rgba(0,0,0,0.4)" : "0 14px 40px rgba(0,0,0,0.4)", opacity: p, transform: `scale(${0.7 + 0.3 * p})` }}>
      {done !== undefined && (
        <div style={{ width: 32, height: 32, flex: "none", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: ok ? "rgba(34,197,94,0.18)" : "rgba(234,179,8,0.12)", border: `2px solid ${ok ? C.green : "#eab308"}` }}>
          {ok ? <div style={{ transform: `scale(${okP})` }}><Check size={18} /></div> : <div style={{ width: 14, height: 14, borderRadius: 7, border: "2.5px solid #eab308", borderTopColor: "transparent", transform: `rotate(${f * 18}deg)` }} />}
        </div>
      )}
      {done === undefined && <div style={{ width: 8, alignSelf: "stretch", margin: "14px 0", borderRadius: 4, background: accent, flex: "none" }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 22, color: C.text, whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontFamily: mono, fontSize: 15, color: C.muted, marginTop: 3, whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
    </div>
  );
};

export const Heading: React.FC<{ kicker: string; title: string; f: number }> = ({ kicker, title, f }) => {
  const p = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: 4, color: C.teal }}>{kicker}</div>
      <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 64, color: C.text, letterSpacing: -2, marginTop: 6 }}>{title}</div>
    </div>
  );
};
