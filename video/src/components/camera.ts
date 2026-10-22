import { Easing, interpolate } from "remotion";
import type { Focus } from "../config";

/** Smooth camera: interpolates zoom + focus point between keyframes and keeps the frame edges covered. */
export function cameraTransform(progress: number, keys: Focus[] | undefined, w: number, h: number): string {
  if (!keys || keys.length === 0) return "none";
  const k = keys.length === 1 ? [keys[0], keys[0]] : keys;
  const ts = k.map((x) => x.t);
  const opt = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  const s = interpolate(progress, ts, k.map((x) => x.s), opt);
  const x = interpolate(progress, ts, k.map((x) => x.x), opt);
  const y = interpolate(progress, ts, k.map((x) => x.y), opt);
  const tx = (0.5 - x) * w * (s - 1);
  const ty = (0.5 - y) * h * (s - 1);
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}
