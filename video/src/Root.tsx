import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { buildTimeline } from "./timeline";
import { FPS, H, W } from "./theme";

export const RemotionRoot: React.FC = () => {
  const { total } = buildTimeline();
  return <Composition id="ClassBridgeDemo" component={Main} durationInFrames={Math.max(30, total)} fps={FPS} width={W} height={H} />;
};
