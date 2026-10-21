import { z } from "zod";

export const POLICY_VERSIONS = { terms: "2026-10-21", privacy: "2026-10-21" } as const;

export const emailSchema = z.string().trim().toLowerCase().email("invalid_email").max(254);
export const passwordSchema = z.string().min(10, "password_too_short").max(128, "password_too_long")
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "password_weak");

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, "name_too_short").max(80),
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().max(64).default("UTC"),
  locale: z.enum(["en", "fr", "ar"]).default("en"),
  acceptTerms: z.literal(true, { message: "terms_required" }),
  confirmAdult: z.literal(true, { message: "adult_required" }),
  marketingOptIn: z.boolean().default(false),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "required").max(128) });
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
