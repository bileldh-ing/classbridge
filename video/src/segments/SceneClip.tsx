import React from "react";
import { AbsoluteFill, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneCfg } from "../config";
import { BrowserFrame, FRAME } from "../components/BrowserFrame";
import { LowerThird } from "../components/LowerThird";
import { cameraTransform } from "../components/camera";

export const SceneClip: React.FC<{ cfg: SceneCfg; file: string; tag: string; rate: number; durationInFrames: number }> = ({ cfg, file, tag, rate, durationInFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: 24 });
  const vw = FRAME.width, vh = (FRAME.width * 9) / 16;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: (1920 - vw) / 2, top: 24, transform: `scale(${0.95 + 0.05 * enter})`, opacity: 0.4 + 0.6 * enter }}>
        <BrowserFrame url={cfg.url}>
          <div style={{ width: vw, height: vh, transform: cameraTransform(f / durationInFrames, cfg.camera, vw, vh), transformOrigin: "50% 50%" }}>
            <OffthreadVideo src={staticFile(file)} muted playbackRate={rate} startFrom={Math.round((cfg.trimStart ?? 0) * fps)} style={{ width: vw, height: vh }} />
          </div>
        </BrowserFrame>
      </div>
      <LowerThird tag={tag} title={cfg.title} text={cfg.text} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
