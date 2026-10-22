/** Editorial config: chapters, per-scene captions, browser URL and camera moves. Durations come from the recordings. */
export type Focus = { t: number; x: number; y: number; s: number }; // t = fraction of the clip, (x,y) = focus point 0..1, s = zoom
export type SceneCfg = { id: string; title: string; text: string; url: string; trimStart?: number; trimEnd?: number; camera?: Focus[] };
export type Chapter = { key: string; title: string; subtitle: string; scenes: string[] };

export const CHAPTERS: Chapter[] = [
  { key: "discover", title: "Discover", subtitle: "Find the right teacher", scenes: ["scene-01", "scene-02", "scene-03", "scene-04"] },
  { key: "book", title: "Book", subtitle: "From a free slot to a confirmed lesson", scenes: ["scene-05", "scene-06", "scene-07", "scene-08"] },
  { key: "learn", title: "Learn", subtitle: "Live lessons and self-paced courses", scenes: ["scene-09", "scene-10", "scene-12"] },
  { key: "teach", title: "Teach", subtitle: "A full workspace for teachers", scenes: ["scene-11"] },
  { key: "connect", title: "Connect", subtitle: "Messaging, notifications and reviews", scenes: ["scene-13", "scene-14"] },
  { key: "operate", title: "Operate", subtitle: "Admin, trust and safety", scenes: ["scene-15"] },
  { key: "global", title: "Go global", subtitle: "English, French and Arabic (RTL)", scenes: ["scene-16"] },
  { key: "mobile", title: "Mobile", subtitle: "PWA plus native Android and iOS shells", scenes: ["scene-17"] },
  { key: "ship", title: "Ship it", subtitle: "CI/CD pipeline and architecture", scenes: [] },
];

const zoomIn = (x: number, y: number, s = 1.22, from = 0.3, to = 0.75): Focus[] => [
  { t: 0, x: 0.5, y: 0.5, s: 1 },
  { t: from, x, y, s },
  { t: to, x, y, s },
  { t: Math.min(1, to + 0.15), x: 0.5, y: 0.5, s: 1 },
];

export const SCENES: Record<string, SceneCfg> = {
  "scene-01": { id: "scene-01", url: "/", title: "Landing page", text: "Verified teachers, live online or near you, with subjects, how it works and transparent pricing.", camera: zoomIn(0.4, 0.35, 1.12, 0.05, 0.35) },
  "scene-02": { id: "scene-02", url: "/teachers", title: "Server-side search", text: "Filter by subject, language and format. Results are queried in PostgreSQL, not filtered in the browser.", camera: zoomIn(0.3, 0.35, 1.2) },
  "scene-03": { id: "scene-03", url: "/teachers?view=map", title: "Map view", text: "Clustered markers that only ever show approximate, privacy-safe teacher locations.", camera: zoomIn(0.55, 0.55, 1.15) },
  "scene-04": { id: "scene-04", url: "/teachers/amira-demo-1", title: "Teacher profile", text: "Verification badges, credentials, lesson offerings and reviews on one page.", camera: zoomIn(0.35, 0.3, 1.15, 0.1, 0.4) },
  "scene-05": { id: "scene-05", url: "/teachers/sara-demo-3", title: "Real availability", text: "Free slots are computed from the teacher's schedule and shown in the visitor's own time zone.", camera: zoomIn(0.7, 0.5, 1.2) },
  "scene-06": { id: "scene-06", url: "/signup", title: "Sign up", text: "Free account for adults (18+) with explicit consent, then straight to the dashboard.", camera: zoomIn(0.5, 0.45, 1.18) },
  "scene-07": { id: "scene-07", url: "/teachers/sara-demo-3", title: "Book a trial lesson", text: "The slot is held during checkout, then the free trial is confirmed in one click.", camera: zoomIn(0.6, 0.45, 1.15) },
  "scene-08": { id: "scene-08", url: "/checkout", title: "Payments adapter", text: "Paid lessons go through a payment-provider adapter that reports an honest 'not configured' state.", camera: zoomIn(0.5, 0.45, 1.15, 0.45, 0.85) },
  "scene-09": { id: "scene-09", url: "/lessons", title: "My lessons", text: "Upcoming and past lessons, each with a full status history.", camera: zoomIn(0.45, 0.4, 1.15) },
  "scene-10": { id: "scene-10", url: "/lessons/…/classroom", title: "Private classroom", text: "Short-lived tokens, for participants only, and only inside the join window.", camera: zoomIn(0.5, 0.45, 1.15) },
  "scene-11": { id: "scene-11", url: "/teach", title: "Teacher workspace", text: "Public profile, weekly availability, offerings, group sessions and a course builder.", camera: [{ t: 0, x: 0.5, y: 0.5, s: 1 }, { t: 1, x: 0.5, y: 0.4, s: 1.06 }] },
  "scene-12": { id: "scene-12", url: "/learn/…", title: "Course player", text: "Progress, private notes, bookmarks, a server-graded quiz and a verifiable certificate.", camera: [{ t: 0, x: 0.5, y: 0.5, s: 1 }, { t: 1, x: 0.5, y: 0.4, s: 1.06 }] },
  "scene-13": { id: "scene-13", url: "/messages", title: "Realtime messaging", text: "Booking-gated threads over server-sent events, private attachments and a notification centre.", camera: zoomIn(0.5, 0.6, 1.15, 0.35, 0.7) },
  "scene-14": { id: "scene-14", url: "/teachers/lucas-demo-2", title: "Verified reviews", text: "Reviews only after a completed, attended lesson, and only one per booking.", camera: zoomIn(0.45, 0.5, 1.15) },
  "scene-15": { id: "scene-15", url: "/admin", title: "Admin console", text: "TOTP 2FA, teacher verification with reasons, audit log, support queue, feature flags and moderation.", camera: [{ t: 0, x: 0.5, y: 0.5, s: 1 }, { t: 1, x: 0.5, y: 0.4, s: 1.06 }] },
  "scene-16": { id: "scene-16", url: "/", title: "Arabic and RTL", text: "Every screen in English, French and Arabic, with a full right-to-left layout.", camera: zoomIn(0.6, 0.4, 1.12) },
  "scene-17": { id: "scene-17", url: "/", title: "Mobile", text: "Responsive and installable, wrapped as Android and iOS apps with Capacitor.", camera: [] },
};

export const MOBILE_POINTS = [
  "Responsive layouts, e2e-tested on a Pixel 7 viewport",
  "Installable PWA with service worker and offline page",
  "Capacitor 8 shells for Android and iOS",
  "CI builds a debug APK and an iOS simulator app",
];
