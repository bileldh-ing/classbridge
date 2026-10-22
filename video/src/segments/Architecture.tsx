import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, inter, mono } from "../theme";
import { clamp, curve, DrawPath, Heading, Node } from "./diagram";

export const ARCH_FRAMES = 300;
const H = 72;

export const Architecture: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [ARCH_FRAMES - 12, ARCH_FRAMES], [1, 0], clamp);
  const clients = [{ t: "Browser / PWA", s: "service worker" }, { t: "Android app", s: "Capacitor shell" }, { t: "iOS app", s: "Capacitor shell" }];
  const inner = [
    { t: "proxy.ts", s: "CSP nonce + request id" },
    { t: "Server Components", s: "pages, i18n EN/FR/AR" },
    { t: "Route handlers /api/*", s: "zod-validated" },
    { t: "Service layer", s: "authz + business rules" },
    { t: "Realtime hub", s: "LISTEN/NOTIFY → SSE" },
  ];
  const data = [{ t: "PostgreSQL 17", s: "Drizzle · constraints · triggers" }, { t: "Private storage", s: "disk or S3" }];
  const prov = [{ t: "Stripe", s: "PaymentProvider" }, { t: "LiveKit", s: "ClassroomProvider" }, { t: "Mapbox / Nominatim", s: "GeocodingProvider" }, { t: "Resend", s: "EmailProvider" }];
  const appX = 620, appY = 250, appW = 620, appH = 560;
  const cY = (i: number) => 330 + i * 140;
  const rX = 1350, rW = 400;
  const dY = (i: number) => 260 + i * 92;
  const pY = (i: number) => 470 + i * 88;
  const box = interpolate(f, [30, 48], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Heading kicker="ARCHITECTURE" title="One Next.js app, providers behind adapters" f={f} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {clients.map((_, i) => <DrawPath key={`c${i}`} d={curve(160 + 340, cY(i) + H / 2, appX, appY + appH / 2)} f={f} from={50 + i * 5} />)}
        {data.map((_, i) => <DrawPath key={`d${i}`} d={curve(appX + appW, appY + appH / 2, rX, dY(i) + H / 2)} f={f} from={130 + i * 6} color="rgba(59,130,246,0.8)" />)}
        {prov.map((_, i) => <DrawPath key={`p${i}`} d={curve(appX + appW, appY + appH / 2, rX, pY(i) + H / 2)} f={f} from={170 + i * 6} color="rgba(20,184,166,0.8)" />)}
      </svg>
      {clients.map((n, i) => <Node key={n.t} x={160} y={cY(i)} w={340} h={H} title={n.t} sub={n.s} f={f} appear={18 + i * 6} accent={C.pink} />)}
      <div style={{ position: "absolute", left: appX, top: appY, width: appW, height: appH, borderRadius: 22, border: "1.5px solid rgba(139,92,246,0.6)", background: "rgba(139,92,246,0.07)", boxShadow: "0 0 60px rgba(139,92,246,0.2)", opacity: box, transform: `scale(${0.9 + 0.1 * box})` }}>
        <div style={{ padding: "18px 24px 0", fontFamily: inter, fontWeight: 800, fontSize: 26, color: C.text }}>Next.js 16 app</div>
        <div style={{ padding: "2px 24px", fontFamily: mono, fontSize: 15, color: C.muted }}>standalone Node server · React 19 · TypeScript</div>
      </div>
      {inner.map((n, i) => <Node key={n.t} x={appX + 30} y={appY + 100 + i * 88} w={appW - 60} h={H} title={n.t} sub={n.s} f={f} appear={60 + i * 10} accent={C.purple} />)}
      <div style={{ position: "absolute", left: rX, top: 222, fontFamily: mono, fontSize: 16, letterSpacing: 3, color: C.muted, opacity: interpolate(f, [125, 140], [0, 1], clamp) }}>DATA</div>
      {data.map((n, i) => <Node key={n.t} x={rX} y={dY(i)} w={rW} h={H} title={n.t} sub={n.s} f={f} appear={135 + i * 6} accent={C.blue} />)}
      <div style={{ position: "absolute", left: rX, top: 437, fontFamily: mono, fontSize: 16, letterSpacing: 3, color: C.muted, opacity: interpolate(f, [165, 180], [0, 1], clamp) }}>PROVIDER ADAPTERS</div>
      {prov.map((n, i) => <Node key={n.t} x={rX} y={pY(i)} w={rW} h={H} title={n.t} sub={n.s} f={f} appear={175 + i * 6} accent={C.teal} />)}
      <div style={{ position: "absolute", left: 0, right: 0, top: 880, textAlign: "center", fontFamily: inter, fontSize: 26, color: C.muted, opacity: interpolate(f, [215, 235], [0, 1], clamp) }}>
        Unconfigured providers report an explicit <span style={{ color: C.text, fontWeight: 700 }}>“not configured”</span> state instead of pretending to succeed.
      </div>
    </AbsoluteFill>
  );
};
