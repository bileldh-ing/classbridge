import React from "react";
import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";

type P = Record<string, unknown>;

/** Whip-pan: fast horizontal move with motion blur peaking mid-transition. */
const Whip: React.FC<TransitionPresentationComponentProps<P>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const entering = presentationDirection === "entering";
  const x = entering ? (1 - p) * 110 : -p * 110;
  const blur = Math.sin(p * Math.PI) * 28;
  return <AbsoluteFill style={{ transform: `translateX(${x}%)`, filter: `blur(${blur}px)` }}>{children}</AbsoluteFill>;
};
export const whip = (): TransitionPresentation<P> => ({ component: Whip, props: {} });

/** Zoom-through: outgoing scene scales up and fades, incoming scales down into place. */
const Zoom: React.FC<TransitionPresentationComponentProps<P>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const entering = presentationDirection === "entering";
  const s = entering ? 0.85 + 0.15 * p : 1 + 0.25 * p;
  const o = entering ? p : 1 - p;
  return <AbsoluteFill style={{ transform: `scale(${s})`, opacity: o, filter: `blur(${(entering ? 1 - p : p) * 8}px)` }}>{children}</AbsoluteFill>;
};
export const zoom = (): TransitionPresentation<P> => ({ component: Zoom, props: {} });
