import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const inter = loadInter("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "600"], subsets: ["latin"] }).fontFamily;

export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const C = {
  bg: "#07070d",
  panel: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#f5f6ff",
  muted: "#a5a8c3",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  teal: "#14b8a6",
  pink: "#ec4899",
  green: "#22c55e",
};
export const GRAD = `linear-gradient(90deg, ${C.purple}, ${C.blue} 55%, ${C.teal})`;
