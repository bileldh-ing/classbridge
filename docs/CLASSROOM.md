# Live classroom

## Implemented
- **Provider adapter** `src/lib/classroom/provider.ts` (`ClassroomProvider`): LiveKit token issuer using `livekit-server-sdk`. Enabled only when `LIVEKIT_URL` (wss://), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are set; otherwise every entry point shows **"The live classroom isn't configured"** and the token endpoint returns `503 CLASSROOM_PROVIDER_NOT_CONFIGURED`.
- **Token endpoint** `POST /api/classrooms/:bookingId/token` (server-validated):
  - caller must be the booking's student or teacher (others → 404; admins are not participants → refused);
  - booking must be `confirmed` or `in_progress`, mode `online`;
  - now ∈ [start − `CLASSROOM_JOIN_EARLY_MINUTES` (10), end + `CLASSROOM_JOIN_LATE_MINUTES` (15)];
  - grant: `roomJoin` for **one** random room (`cb-<random>` generated at booking time), `canPublish`, `canSubscribe`, `canPublishData`; no admin/record/create; identity = user UUID (opaque); TTL = min(10 min, until window end);
  - denials are recorded in `classroom_events` (kind `token_denied`, for participants) and token requests are rate-limited (30 per 10 min per user);
  - when the **teacher** first obtains a token, the booking moves `confirmed → in_progress` (event recorded).
- **Classroom page** `/lessons/:id/classroom`: pre-checks (status, window, provider) before rendering; client uses `livekit-client`: connect, camera/mic toggles, screen share, participants list, chat + raise-hand via data messages (ephemeral), reconnecting/disconnected states, leave. Join/leave events stored in `classroom_events` for attendance evidence.
- **Teacher attendance & notes**: `/teach/bookings/:id` → "Record attendance & complete" (present/late/absent) after start; absent → `no_show_student`. Notes and an https materials link are visible to the student.

## Not implemented / not verified
- **No live media test was possible** (no LiveKit credentials, and no browser automation in this environment). Token issuance, grants, TTL, window and authorization are covered by integration tests (`classroom-reviews.test.ts`) that decode the issued JWT.
- Recording is not offered (and not implied anywhere). Whiteboard, device picker, network-quality indicator and in-room persistent chat are not implemented.
- Self-hosted LiveKit has no token revocation; short TTLs mitigate this.

## Configure
1. LiveKit Cloud project (or self-hosted server) → copy URL/key/secret into `.env.local`.
2. Restart the app; Admin overview shows "Live classroom: livekit".
3. Book a lesson starting within ~10 minutes (or add an availability exception) and open it from both accounts.
