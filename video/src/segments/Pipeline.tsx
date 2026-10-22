import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, mono } from "../theme";
import { clamp, curve, DrawPath, Heading, Node } from "./diagram";

export const PIPELINE_FRAMES = 330;
const NW = 380, NH = 78, GAP = 20;
const colX = [90, 560, 1030, 1460];
const col = (n: number, top = 300) => Array.from({ length: n }, (_, i) => top + i * (NH + GAP) + (5 - n) * (NH + GAP) / 2);

const CI = [
  { t: "Lint · typecheck · unit", s: "eslint · tsc · vitest" },
  { t: "Integration tests", s: "real PostgreSQL 17 service" },
  { t: "Build + Playwright e2e", s: "next build · chromium" },
  { t: "Docker image build", s: "buildx · GHA cache" },
];
const GATES = [
  { t: "CodeQL", s: "security analysis" },
  { t: "Dependency audit", s: "nightly + lockfile changes" },
  { t: "release-please", s: "conventional commits → tag" },
];
const DELIVER = [
  { t: "Image → GHCR", s: "CD on tag v*" },
  { t: "GitHub Release", s: "changelog from commits" },
  { t: "Deploy", s: "Fly / Render / Vercel (gated)" },
  { t: "Android debug APK", s: "Capacitor · Gradle" },
  { t: "iOS simulator build", s: "Xcode · unsigned" },
];

export const Pipeline: React.FC = () => {
  const f = useCurrentFrame();
  const yT = col(1)[0], yCI = col(4), yG = col(3), yD = col(5);
  const fade = interpolate(f, [PIPELINE_FRAMES - 12, PIPELINE_FRAMES], [1, 0], clamp);
  const cx = (i: number) => colX[i] + (i === 0 ? 300 : NW);
  const tw = 300;
  const labels = ["TRIGGER", "CI  ·  every push & PR", "GATES", "DELIVER"];
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Heading kicker="CI / CD" title="Every push runs the whole pipeline" f={f} />
      {labels.map((l, i) => (
        <div key={l} style={{ position: "absolute", left: colX[i], top: 240, fontFamily: mono, fontSize: 17, letterSpacing: 3, color: C.muted, opacity: interpolate(f, [10 + i * 30, 22 + i * 30], [0, 1], clamp) }}>{l}</div>
      ))}
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {yCI.map((y, i) => <DrawPath key={`a${i}`} d={curve(cx(0), yT + NH / 2, colX[1], y + NH / 2)} f={f} from={28 + i * 4} />)}
        {yG.map((y, i) => <DrawPath key={`b${i}`} d={curve(cx(1), yCI[Math.min(i + 1, 3)] + NH / 2, colX[2], y + NH / 2)} f={f} from={150 + i * 5} color="rgba(59,130,246,0.75)" />)}
        {yD.map((y, i) => <DrawPath key={`c${i}`} d={curve(cx(2), yG[i < 3 ? 2 : 0] + NH / 2, colX[3], y + NH / 2)} f={f} from={205 + i * 5} color="rgba(20,184,166,0.8)" />)}
      </svg>
      <Node x={colX[0]} y={yT} w={tw} h={NH} title="git push / PR" sub="main · pull_request" f={f} appear={10} done={26} />
      {CI.map((n, i) => <Node key={n.t} x={colX[1]} y={yCI[i]} w={NW} h={NH} title={n.t} sub={n.s} f={f} appear={40 + i * 6} done={95 + i * 14} />)}
      {GATES.map((n, i) => <Node key={n.t} x={colX[2]} y={yG[i]} w={NW} h={NH} title={n.t} sub={n.s} f={f} appear={165 + i * 6} done={195 + i * 8} />)}
      {DELIVER.map((n, i) => <Node key={n.t} x={colX[3]} y={yD[i]} w={NW} h={NH} title={n.t} sub={n.s} f={f} appear={220 + i * 6} done={250 + i * 7} />)}
      <div style={{ position: "absolute", left: 0, right: 0, top: 860, textAlign: "center", fontFamily: mono, fontSize: 21, color: C.muted, opacity: interpolate(f, [270, 290], [0, 1], clamp) }}>
        .github/workflows: ci · cd · codeql · dependency-audit · release-please · mobile · demo-video · render-video
      </div>
    </AbsoluteFill>
  );
};
