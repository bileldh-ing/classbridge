import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import runsData from "../generated/runs.json";
import { C, inter, mono } from "../theme";
import { Check } from "../components/Check";
import { clamp, Heading } from "./diagram";

export type Run = { workflow: string; title: string; number: number; branch: string; event: string; sha: string; actor: string; created: string; seconds: number; conclusion: string };
export const RUNS: Run[] = ((runsData as { runs: Run[] }).runs ?? []).slice(0, 7);
export const RUNS_FRAMES = 210;

const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Real workflow runs fetched from the GitHub API at render time (see render-video.yml). */
export const Runs: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: f - 6, fps, config: { damping: 200 } });
  const fade = interpolate(f, [RUNS_FRAMES - 12, RUNS_FRAMES], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Heading kicker="REAL RUNS · GITHUB ACTIONS API" title="Green across the board" f={f} />
      <div style={{ position: "absolute", left: 230, top: 250, width: 1460, borderRadius: 16, overflow: "hidden", background: "#0d1117", border: "1px solid #30363d", boxShadow: "0 40px 100px rgba(0,0,0,0.6)", opacity: card, transform: `translateY(${(1 - card) * 40}px)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 26px", background: "#161b22", borderBottom: "1px solid #30363d", fontFamily: inter }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e6edf3" }}>bileldh-ing / classbridge <span style={{ color: "#7d8590", fontWeight: 500 }}>· Actions · All workflows</span></div>
          <div style={{ fontFamily: mono, fontSize: 16, color: "#7d8590" }}>{RUNS.length} recent successful runs</div>
        </div>
        {RUNS.map((r, i) => {
          const p = spring({ frame: f - 18 - i * 7, fps, config: { damping: 200 } });
          return (
            <div key={`${r.workflow}${r.number}`} style={{ display: "flex", alignItems: "center", gap: 18, padding: "15px 26px", borderBottom: i < RUNS.length - 1 ? "1px solid #21262d" : undefined, opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(35,134,54,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Check size={18} color="#3fb950" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 21, color: "#e6edf3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                <div style={{ fontFamily: inter, fontSize: 16, color: "#7d8590", marginTop: 3 }}><b style={{ color: "#c9d1d9" }}>{r.workflow}</b> #{r.number}: {r.event === "push" ? "Commit" : r.event} {r.sha.slice(0, 7)} by {r.actor}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 15, color: "#58a6ff", background: "rgba(56,139,253,0.12)", padding: "4px 12px", borderRadius: 999, flex: "none" }}>{r.branch}</div>
              <div style={{ width: 180, textAlign: "right", fontFamily: inter, fontSize: 16, color: "#7d8590", flex: "none" }}>{date(r.created)}<br />{dur(r.seconds)}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
