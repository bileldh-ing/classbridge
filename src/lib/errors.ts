/** Consistent error envelope: { error: { code, message, details? } } */
export type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED" | "CONFLICT"
  | "SLOT_UNAVAILABLE" | "HOLD_EXPIRED" | "INVALID_TRANSITION" | "RATE_LIMITED"
  | "PAYMENT_PROVIDER_NOT_CONFIGURED" | "CLASSROOM_PROVIDER_NOT_CONFIGURED" | "GEOCODER_NOT_CONFIGURED"
  | "PROVIDER_ERROR" | "OUTSIDE_JOIN_WINDOW" | "NOT_ELIGIBLE" | "BAD_SIGNATURE" | "INTERNAL" | "MFA_REQUIRED";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_FAILED: 422, CONFLICT: 409,
  SLOT_UNAVAILABLE: 409, HOLD_EXPIRED: 410, INVALID_TRANSITION: 409, RATE_LIMITED: 429,
  PAYMENT_PROVIDER_NOT_CONFIGURED: 503, CLASSROOM_PROVIDER_NOT_CONFIGURED: 503, GEOCODER_NOT_CONFIGURED: 503,
  PROVIDER_ERROR: 502, OUTSIDE_JOIN_WINDOW: 403, NOT_ELIGIBLE: 403, BAD_SIGNATURE: 400, INTERNAL: 500, MFA_REQUIRED: 403,
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
  get status() { return STATUS[this.code]; }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Postgres error helpers */
export function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
