import React from "react";
import { AbsoluteFill, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { MOBILE_POINTS, type SceneCfg } from "../config";
import { PhoneFrame } from "../components/PhoneFrame";
import { C, GRAD, inter, mono } from "../theme";
import { Check } from "../components/Check";

export const MobileClip: React.FC<{ cfg: SceneCfg; file: string; tag: string; rate: number; durationInFrames: number; srcW: number; srcH: number }> = ({ cfg, file, tag, rate, durationInFrames, srcW, srcH }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screenH = 860;
  const screenW = Math.round((srcW / srcH) * screenH);
  const enter = spring({ frame: f, fps, config: { damping: 18, mass: 0.9 } });
  const out = Math.min(1, Math.max(0, (durationInFrames - f) / 15));
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 300, top: (1080 - screenH - 48 - 28) / 2, transform: `translateY(${(1 - enter) * 120}px) rotate(${(1 - enter) * -4}deg)`, opacity: enter }}>
        <PhoneFrame width={screenW} height={screenH}>
          <OffthreadVideo src={staticFile(file)} muted playbackRate={rate} startFrom={Math.round((cfg.trimStart ?? 0) * fps)} style={{ width: screenW, height: screenH }} />
        </PhoneFrame>
      </div>
      <div style={{ position: "absolute", left: 960, top: 260, width: 820, opacity: out }}>
        <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: 3, color: C.teal, textTransform: "uppercase" }}>{tag}</div>
        <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 64, lineHeight: 1.05, color: C.text, marginTop: 12, letterSpacing: -1.5 }}>
          ClassBridge<br /><span style={{ backgroundImage: GRAD, WebkitBackgroundClip: "text", color: "transparent" }}>in your pocket</span>
        </div>
        <div style={{ fontFamily: inter, fontSize: 26, color: C.muted, marginTop: 18, lineHeight: 1.35 }}>{cfg.text}</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 16 }}>
          {MOBILE_POINTS.map((p, i) => {
            const s = spring({ frame: f - 25 - i * 12, fps, config: { damping: 200 } });
            return (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 16, opacity: s, transform: `translateX(${(1 - s) * 40}px)` }}>
                <div style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(34,197,94,0.18)", border: `2px solid ${C.green}`, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", }}><Check size={18} /></div>
                <div style={{ fontFamily: inter, fontWeight: 600, fontSize: 26, color: C.text }}>{p}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
