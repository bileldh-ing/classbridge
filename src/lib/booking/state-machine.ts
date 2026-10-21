/**
 * Booking state machine. The single source of truth for legal transitions and which actor
 * may perform them. Booking status, payment status and attendance are tracked separately.
 */
export const BOOKING_STATUSES = [
  "draft", "slot_held", "awaiting_payment", "confirmed", "in_progress", "completed",
  "expired", "canceled_by_student", "canceled_by_teacher", "payment_failed",
  "no_show_student", "no_show_teacher", "refund_pending", "refunded", "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type Actor = "student" | "teacher" | "admin" | "system" | "provider";

type Rule = { to: BookingStatus; actors: Actor[] };

const T: Record<BookingStatus, Rule[]> = {
  draft: [{ to: "slot_held", actors: ["student"] }],
  slot_held: [
    { to: "awaiting_payment", actors: ["student", "system"] },
    { to: "confirmed", actors: ["system"] }, // free offerings only (enforced by service)
    { to: "expired", actors: ["system"] },
    { to: "canceled_by_student", actors: ["student"] },
  ],
  awaiting_payment: [
    { to: "confirmed", actors: ["provider"] },
    { to: "payment_failed", actors: ["provider"] },
    { to: "expired", actors: ["system", "provider"] },
    { to: "canceled_by_student", actors: ["student"] },
  ],
  confirmed: [
    { to: "in_progress", actors: ["teacher", "system"] },
    { to: "completed", actors: ["teacher"] },
    { to: "canceled_by_student", actors: ["student"] },
    { to: "canceled_by_teacher", actors: ["teacher", "admin"] },
    { to: "refund_pending", actors: ["student", "teacher", "admin"] },
    { to: "no_show_student", actors: ["teacher"] },
    { to: "no_show_teacher", actors: ["admin", "system"] },
  ],
  in_progress: [
    { to: "completed", actors: ["teacher", "system"] },
    { to: "no_show_student", actors: ["teacher"] },
    { to: "no_show_teacher", actors: ["admin", "system"] },
  ],
  completed: [{ to: "disputed", actors: ["student", "admin"] }],
  no_show_teacher: [{ to: "refund_pending", actors: ["admin", "system"] }],
  no_show_student: [{ to: "disputed", actors: ["student", "admin"] }],
  disputed: [
    { to: "refund_pending", actors: ["admin"] },
    { to: "completed", actors: ["admin"] },
  ],
  refund_pending: [{ to: "refunded", actors: ["provider"] }],
  expired: [],
  canceled_by_student: [],
  canceled_by_teacher: [{ to: "refund_pending", actors: ["admin", "system"] }],
  payment_failed: [],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  return T[from].some((r) => r.to === to && r.actors.includes(actor));
}

export function allowedTransitions(from: BookingStatus, actor: Actor): BookingStatus[] {
  return T[from].filter((r) => r.actors.includes(actor)).map((r) => r.to);
}

export function isTerminal(s: BookingStatus): boolean {
  return T[s].length === 0;
}

/** Statuses that occupy the teacher's calendar (must mirror the DB exclusion constraint). */
export const SLOT_OCCUPYING: BookingStatus[] = [
  "slot_held", "awaiting_payment", "confirmed", "in_progress", "completed", "no_show_student", "no_show_teacher", "disputed",
];

export const UPCOMING_STATUSES: BookingStatus[] = ["slot_held", "awaiting_payment", "confirmed", "in_progress"];
