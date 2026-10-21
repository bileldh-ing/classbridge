/**
 * Server environment validation. Imported only from server code.
 * Core variables are required; provider variables are optional and their absence puts the
 * matching adapter into an explicit "not configured" state (never a silent success).
 */
import { z } from "zod";

const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://classbridge:classbridge@127.0.0.1:54329/classbridge"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").default("dev-only-insecure-secret-change-me-000000"),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(2).max(60).default(10),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(1500),
  STORAGE_DIR: z.string().default("./storage/private"),
  ENABLE_DEV_OUTBOX: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  LIVEKIT_URL: optional,
  LIVEKIT_API_KEY: optional,
  LIVEKIT_API_SECRET: optional,
  MAPBOX_ACCESS_TOKEN: optional,
  MAPBOX_PERMANENT_GEOCODING: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  NOMINATIM_CONTACT_EMAIL: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_SECRET.startsWith("dev-only")) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() { cached = undefined; }

export function providerStatus() {
  const e = env();
  return {
    payments: e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET ? ("stripe" as const) : null,
    paymentsTestMode: e.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false,
    classroom: e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET ? ("livekit" as const) : null,
    geocoding: e.MAPBOX_ACCESS_TOKEN ? ("mapbox" as const) : e.NOMINATIM_CONTACT_EMAIL ? ("nominatim" as const) : null,
    email: e.RESEND_API_KEY && e.EMAIL_FROM ? ("resend" as const) : null,
    devOutbox: e.ENABLE_DEV_OUTBOX,
  };
}
