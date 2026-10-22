import manifest from "./generated/manifest.json";
import { CHAPTERS, SCENES } from "./config";
import { FPS } from "./theme";
import { INTRO_FRAMES } from "./segments/Intro";
import { STACK_FRAMES } from "./segments/TechStack";
import { CARD_FRAMES } from "./segments/ChapterCard";
import { PIPELINE_FRAMES } from "./segments/Pipeline";
import { RUNS, RUNS_FRAMES } from "./segments/Runs";
import { ARCH_FRAMES } from "./segments/Architecture";
import { OUTRO_FRAMES } from "./segments/Outro";

export type ManifestScene = { id: string; file: string; seconds: number; width: number; height: number };
export type Transition = "fade" | "slide" | "wipe" | "whip" | "zoom";
export type Item =
  | { kind: "intro" | "stack" | "pipeline" | "runs" | "arch" | "outro"; frames: number }
  | { kind: "card"; frames: number; chapter: number }
  | { kind: "scene"; frames: number; chapter: number; scene: ManifestScene; rate: number; mobile: boolean };

export const TRANSITION_FRAMES = 16;
const MAX_SECONDS = 450; // keep the whole film under 7.5 min

const scenes = (manifest as { scenes: ManifestScene[] }).scenes;
const byPrefix = (p: string) => scenes.find((s) => s.id.startsWith(p + "-") || s.id === p);

export function buildTimeline(): { items: Item[]; transitions: Transition[]; total: number; rate: number; missing: string[] } {
  const fixed: Item[] = [];
  const missing: string[] = [];
  let rawSceneSeconds = 0;
  for (const ch of CHAPTERS) for (const id of ch.scenes) {
    const s = byPrefix(id);
    if (!s) missing.push(id); else rawSceneSeconds += s.seconds - (SCENES[id].trimStart ?? 0) - (SCENES[id].trimEnd ?? 0);
  }
  const overhead = (INTRO_FRAMES + STACK_FRAMES + CHAPTERS.length * CARD_FRAMES + PIPELINE_FRAMES + (RUNS.length ? RUNS_FRAMES : 0) + ARCH_FRAMES + OUTRO_FRAMES) / FPS;
  const rate = Math.min(2.5, Math.max(1, rawSceneSeconds / Math.max(60, MAX_SECONDS - overhead)));

  const items: Item[] = [{ kind: "intro", frames: INTRO_FRAMES }, { kind: "stack", frames: STACK_FRAMES }];
  CHAPTERS.forEach((ch, ci) => {
    const present = ch.scenes.filter((id) => byPrefix(id));
    if (ch.key !== "ship" && present.length === 0) return;
    items.push({ kind: "card", frames: CARD_FRAMES, chapter: ci });
    for (const id of present) {
      const s = byPrefix(id)!;
      const cfg = SCENES[id];
      const usable = s.seconds - (cfg.trimStart ?? 0) - (cfg.trimEnd ?? 0) - 0.1;
      items.push({ kind: "scene", frames: Math.floor((usable / rate) * FPS), chapter: ci, scene: s, rate, mobile: id === "scene-17" });
    }
    if (ch.key === "ship") {
      items.push({ kind: "pipeline", frames: PIPELINE_FRAMES });
      if (RUNS.length) items.push({ kind: "runs", frames: RUNS_FRAMES });
      items.push({ kind: "arch", frames: ARCH_FRAMES });
    }
  });
  items.push({ kind: "outro", frames: OUTRO_FRAMES });
  void fixed;

  const transitions: Transition[] = [];
  let within = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i], b = items[i + 1];
    if (b.kind === "card") transitions.push("whip");
    else if (a.kind === "card") transitions.push(b.kind === "scene" && b.mobile ? "zoom" : "slide");
    else if (a.kind === "scene" && b.kind === "scene") transitions.push(within++ % 2 === 0 ? "fade" : "wipe");
    else if (a.kind === "intro") transitions.push("zoom");
    else transitions.push("fade");
  }
  const total = items.reduce((s, x) => s + x.frames, 0) - transitions.length * TRANSITION_FRAMES;
  return { items, transitions, total, rate, missing };
}
