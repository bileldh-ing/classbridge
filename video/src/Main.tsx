import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, staticFile, useVideoConfig } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { CHAPTERS, SCENES } from "./config";
import { buildTimeline, TRANSITION_FRAMES, type Item, type Transition } from "./timeline";
import { whip, zoom } from "./transitions";
import { Background } from "./components/Background";
import { Intro } from "./segments/Intro";
import { TechStack } from "./segments/TechStack";
import { ChapterCard } from "./segments/ChapterCard";
import { SceneClip } from "./segments/SceneClip";
import { MobileClip } from "./segments/MobileClip";
import { Pipeline } from "./segments/Pipeline";
import { Runs } from "./segments/Runs";
import { Architecture } from "./segments/Architecture";
import { Outro } from "./segments/Outro";

const presentation = (t: Transition) => {
  switch (t) {
    case "fade": return fade();
    case "slide": return slide({ direction: "from-right" });
    case "wipe": return wipe({ direction: "from-left" });
    case "whip": return whip();
    case "zoom": return zoom();
  }
};

const render = (it: Item) => {
  switch (it.kind) {
    case "intro": return <Intro />;
    case "stack": return <TechStack />;
    case "card": return <ChapterCard index={it.chapter} />;
    case "pipeline": return <Pipeline />;
    case "runs": return <Runs />;
    case "arch": return <Architecture />;
    case "outro": return <Outro />;
    case "scene": {
      const key = it.scene.id.slice(0, 8);
      const cfg = SCENES[key];
      const tag = `${String(it.chapter + 1).padStart(2, "0")} · ${CHAPTERS[it.chapter].title}`;
      return it.mobile
        ? <MobileClip cfg={cfg} file={it.scene.file} tag={tag} rate={it.rate} durationInFrames={it.frames} srcW={it.scene.width} srcH={it.scene.height} />
        : <SceneClip cfg={cfg} file={it.scene.file} tag={tag} rate={it.rate} durationInFrames={it.frames} />;
    }
  }
};

export const Main: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const { items, transitions } = buildTimeline();
  return (
    <AbsoluteFill>
      <Background />
      <TransitionSeries>
        {items.flatMap((it, i) => {
          const seq = <TransitionSeries.Sequence key={`s${i}`} durationInFrames={it.frames}>{render(it)}</TransitionSeries.Sequence>;
          if (i === items.length - 1) return [seq];
          return [seq, <TransitionSeries.Transition key={`t${i}`} presentation={presentation(transitions[i])} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES, easing: Easing.inOut(Easing.cubic) })} />];
        })}
      </TransitionSeries>
      <Audio src={staticFile("music.wav")} volume={(f) => 0.38 * interpolate(f, [0, 30, durationInFrames - 75, durationInFrames - 5], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
