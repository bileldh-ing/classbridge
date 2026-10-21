"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, LogOut, Hand, Send } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { Alert, Button } from "@/components/ui";
import type { Room as RoomT } from "livekit-client";

type Chat = { from: string; text: string; at: number };

/**
 * LiveKit classroom. The token comes from /api/classrooms/[id]/token (server-validated membership + window).
 * Chat and hand-raise use LiveKit data messages (ephemeral, not stored). Recording is not available in this build.
 */
export function Classroom({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "reconnecting" | "disconnected">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [msg, setMsg] = useState("");
  const roomRef = useRef<RoomT | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  async function join() {
    setErr(null); setState("connecting");
    try {
      const { token, url } = await api<{ token: string; url: string }>(`/api/classrooms/${bookingId}/token`, { body: {} });
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      const refresh = () => setPeople([room.localParticipant.name || "You", ...[...room.remoteParticipants.values()].map((p) => p.name || p.identity)]);
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.className = "w-full rounded-lg bg-black";
          stageRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      room.on(RoomEvent.ParticipantConnected, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      room.on(RoomEvent.Reconnecting, () => setState("reconnecting"));
      room.on(RoomEvent.Reconnected, () => setState("connected"));
      room.on(RoomEvent.Disconnected, () => { setState("disconnected"); void api(`/api/classrooms/${bookingId}/events`, { body: { kind: "left" } }).catch(() => {}); });
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const m = JSON.parse(new TextDecoder().decode(payload)) as { type: string; text?: string };
          const from = participant?.name || participant?.identity || "?";
          setChat((c) => [...c, { from, text: m.type === "hand" ? "✋" : String(m.text ?? "").slice(0, 500), at: Date.now() }]);
        } catch { /* ignore malformed */ }
      });
      await room.connect(url, token);
      await room.localParticipant.enableCameraAndMicrophone().catch(() => setErr("Camera/microphone unavailable or permission denied. You can still listen and chat."));
      const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (local) { const el = local.attach(); el.className = "w-full rounded-lg bg-black"; el.muted = true; stageRef.current?.prepend(el); }
      refresh();
      setState("connected");
      void api(`/api/classrooms/${bookingId}/events`, { body: { kind: "joined" } }).catch(() => {});
    } catch (e) {
      setState("idle");
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t.common.error);
    }
  }

  const room = roomRef.current;
  const send = async (obj: object) => room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(obj)), { reliable: true });
  const status = { idle: "", connecting: t.classroom.connecting, connected: t.classroom.connected, reconnecting: t.classroom.reconnecting, disconnected: t.classroom.disconnected }[state];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.classroom.deviceHint}</p>
      {err && <Alert tone="error">{err}</Alert>}
      {status && <p role="status" className="text-sm font-medium">{status}</p>}
      {(state === "idle" || state === "disconnected") && <Button onClick={join}>{t.classroom.connect}</Button>}
      {(state === "connected" || state === "reconnecting") && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div>
            <div ref={stageRef} className="grid gap-2 sm:grid-cols-2" aria-label="Video" />
            <div className="mt-3 flex flex-wrap gap-2" role="toolbar" aria-label="Classroom controls">
              <Button variant="secondary" aria-pressed={mic} onClick={async () => { await room?.localParticipant.setMicrophoneEnabled(!mic); setMic(!mic); }}>{mic ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />}{t.classroom.mic}</Button>
              <Button variant="secondary" aria-pressed={cam} onClick={async () => { await room?.localParticipant.setCameraEnabled(!cam); setCam(!cam); }}>{cam ? <VideoIcon className="size-4" aria-hidden /> : <VideoOff className="size-4" aria-hidden />}{t.classroom.camera}</Button>
              <Button variant="secondary" aria-pressed={sharing} onClick={async () => { try { await room?.localParticipant.setScreenShareEnabled(!sharing); setSharing(!sharing); } catch { setErr("Screen sharing is not supported or was blocked."); } }}><MonitorUp className="size-4" aria-hidden />{t.classroom.share}</Button>
              <Button variant="secondary" onClick={() => send({ type: "hand" })}><Hand className="size-4" aria-hidden />{t.classroom.raiseHand}</Button>
              <Button variant="danger" onClick={() => room?.disconnect()}><LogOut className="size-4 rtl-flip" aria-hidden />{t.classroom.leave}</Button>
            </div>
          </div>
          <aside className="space-y-4">
            <div><h2 className="mb-1 text-sm font-semibold">{t.classroom.participants}</h2><ul className="text-sm">{people.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            <div><h2 className="mb-1 text-sm font-semibold">{t.classroom.chat}</h2>
              <ul className="mb-2 max-h-60 space-y-1 overflow-y-auto text-sm" aria-live="polite">{chat.map((c, i) => <li key={i}><span className="font-medium">{c.from}:</span> {c.text}</li>)}</ul>
              <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; await send({ type: "chat", text: msg.slice(0, 500) }); setChat((c) => [...c, { from: "You", text: msg, at: Date.now() }]); setMsg(""); }}>
                <input aria-label={t.classroom.chat} value={msg} onChange={(e) => setMsg(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm" maxLength={500} />
                <Button type="submit" variant="secondary" aria-label={t.classroom.send}><Send className="size-4 rtl-flip" aria-hidden /></Button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
