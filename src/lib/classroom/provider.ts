/** Live classroom provider adapter (LiveKit). Tokens are short-lived and scoped to a single room. */
import { AccessToken } from "livekit-server-sdk";
import { env } from "../env";

export interface ClassroomProvider {
  name: string;
  url: string;
  issueToken(p: { room: string; identity: string; name: string; ttlSeconds: number; isTeacher: boolean }): Promise<string>;
}

export class LiveKitProvider implements ClassroomProvider {
  name = "livekit";
  constructor(public url: string, private apiKey: string, private apiSecret: string) {}
  async issueToken(p: { room: string; identity: string; name: string; ttlSeconds: number; isTeacher: boolean }) {
    const at = new AccessToken(this.apiKey, this.apiSecret, { identity: p.identity, name: p.name, ttl: p.ttlSeconds, metadata: JSON.stringify({ role: p.isTeacher ? "teacher" : "student" }) });
    // Least privilege: join this room only; no room creation/listing/recording/admin grants.
    at.addGrant({ roomJoin: true, room: p.room, canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false });
    return at.toJwt();
  }
}

export function getClassroomProvider(): ClassroomProvider | null {
  const e = env();
  if (e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET) return new LiveKitProvider(e.LIVEKIT_URL, e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET);
  return null;
}
