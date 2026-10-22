/**
 * Support tickets. Users open tickets and reply; staff (support.manage_tickets) work a queue, reply publicly or add
 * internal notes that are NEVER returned to the requester, change status and assign. Status changes are audited.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, DbOrTx } from "../db";
import { bookings, profiles, supportTicketMessages, supportTickets, teacherProfiles, users } from "../db/schema";
import { AppError } from "../errors";
import { can, canViewBooking, type Principal } from "../auth/permissions";
import { rateLimit } from "./rate-limit";
import { notify } from "./notify";
import { audit } from "./audit";
import { enqueueEmail } from "../email/outbox";
import { env } from "../env";

export const TICKET_CATEGORIES = ["general", "booking", "payment", "account", "safety", "technical"] as const;
export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;

export const ticketSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  body: z.string().trim().min(10).max(4000),
  category: z.enum(TICKET_CATEGORIES).default("general"),
  bookingId: z.string().uuid().optional().nullable(),
});
export const replySchema = z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().default(false) });
export const ticketUpdateSchema = z.object({ status: z.enum(TICKET_STATUSES).optional(), assignToMe: z.boolean().optional(), reason: z.string().trim().min(3).max(500) });

function isAgent(p: Principal) { return can(p, "support.manage_tickets"); }

export async function createTicket(db: DB, actor: Principal, input: z.infer<typeof ticketSchema>) {
  const rl = await rateLimit(db, `ticket:${actor.id}`, 5, 3600);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "You have opened several tickets recently. Please wait before opening another.");
  if (input.bookingId) {
    const [b] = await db.select({ studentId: bookings.studentId, teacherUserId: teacherProfiles.userId }).from(bookings)
      .innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, input.bookingId));
    if (!b || !canViewBooking(actor, b)) throw new AppError("NOT_FOUND", "Booking not found.");
  }
  const severity = input.category === "safety" ? "high" : "normal";
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(supportTickets).values({ userId: actor.id, subject: input.subject, body: input.body, category: input.category, bookingId: input.bookingId ?? null, severity }).returning();
    await tx.insert(supportTicketMessages).values({ ticketId: t.id, authorId: actor.id, body: input.body });
    return t;
  });
}

export async function listMyTickets(db: DbOrTx, actor: Principal) {
  return db.select().from(supportTickets).where(eq(supportTickets.userId, actor.id)).orderBy(desc(supportTickets.createdAt)).limit(100);
}

async function loadTicket(db: DbOrTx, actor: Principal, ticketId: string) {
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
  if (!t || (t.userId !== actor.id && !isAgent(actor))) throw new AppError("NOT_FOUND", "Ticket not found.");
  return t;
}

/** Ticket thread. Internal notes are filtered in SQL unless the viewer is support staff. */
export async function getTicket(db: DbOrTx, actor: Principal, ticketId: string) {
  const t = await loadTicket(db, actor, ticketId);
  const staffView = isAgent(actor);
  const msgs = await db.select({ m: supportTicketMessages, author: profiles.displayName }).from(supportTicketMessages)
    .innerJoin(profiles, eq(profiles.userId, supportTicketMessages.authorId))
    .where(and(eq(supportTicketMessages.ticketId, t.id), staffView ? sql`true` : eq(supportTicketMessages.isInternal, false)))
    .orderBy(asc(supportTicketMessages.createdAt));
  const [requester] = await db.select({ name: profiles.displayName, email: users.email }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.userId, t.userId));
  return {
    ticket: { ...t, internalNote: staffView ? t.internalNote : null },
    messages: msgs.map((r) => ({ id: r.m.id, body: r.m.body, isInternal: r.m.isInternal, createdAt: r.m.createdAt, author: r.author, mine: r.m.authorId === actor.id, fromRequester: r.m.authorId === t.userId })),
    requester: staffView ? requester : { name: requester?.name, email: undefined },
    staffView,
  };
}

export async function replyToTicket(db: DB, actor: Principal, ticketId: string, input: z.infer<typeof replySchema>) {
  const t = await loadTicket(db, actor, ticketId);
  const agent = isAgent(actor) && t.userId !== actor.id;
  if (input.internal && !agent) throw new AppError("FORBIDDEN", "Only support staff can add internal notes.");
  if (t.status === "closed" && !agent) throw new AppError("NOT_ELIGIBLE", "This ticket is closed. Open a new ticket if you still need help.");
  const rl = await rateLimit(db, `ticket-reply:${actor.id}`, 30, 600);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many replies. Please wait a moment.");
  return db.transaction(async (tx) => {
    const [m] = await tx.insert(supportTicketMessages).values({ ticketId: t.id, authorId: actor.id, body: input.body, isInternal: input.internal }).returning();
    if (!input.internal) {
      const nextStatus = agent ? "pending" : "open";
      await tx.update(supportTickets).set({ status: t.status === "closed" ? t.status : nextStatus, updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
      if (agent) {
        await notify(tx, { userId: t.userId, kind: "support_reply", title: "Support replied to your ticket", body: t.subject, link: `/support/${t.id}`, dedupeKey: `support_reply:${m.id}` });
        const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, t.userId));
        await enqueueEmail(tx, { to: u.email, userId: t.userId, template: "support_reply", subject: `Re: ${t.subject}`, body: `Our support team replied to your ticket.\n${env().APP_URL}/support/${t.id}`, idempotencyKey: `support_reply:${m.id}` });
      }
    } else {
      await audit(tx, { actorId: actor.id, action: "support.internal_note", targetType: "support_ticket", targetId: t.id });
    }
    return m;
  });
}

export async function updateTicket(db: DB, actor: Principal, ticketId: string, input: z.infer<typeof ticketUpdateSchema>) {
  if (!isAgent(actor)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!t) throw new AppError("NOT_FOUND", "Ticket not found.");
    const patch: Partial<typeof supportTickets.$inferInsert> = { updatedAt: new Date() };
    if (input.status) { patch.status = input.status; patch.closedAt = input.status === "closed" || input.status === "resolved" ? new Date() : null; }
    if (input.assignToMe) patch.assignedTo = actor.id;
    await tx.update(supportTickets).set(patch).where(eq(supportTickets.id, t.id));
    await audit(tx, { actorId: actor.id, action: "support.ticket_updated", targetType: "support_ticket", targetId: t.id, reason: input.reason, metadata: { from: t.status, to: input.status ?? t.status, assigned: !!input.assignToMe } });
    if (input.status && input.status !== t.status && ["resolved", "closed"].includes(input.status)) {
      await notify(tx, { userId: t.userId, kind: "support_status", title: `Ticket ${input.status}`, body: t.subject, link: `/support/${t.id}`, dedupeKey: `support_status:${t.id}:${input.status}:${Date.now()}` });
    }
  });
}

export async function supportQueue(db: DbOrTx, actor: Principal, status: string[] = ["open", "pending"]) {
  if (!isAgent(actor)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  return db.select({ t: supportTickets, requester: profiles.displayName }).from(supportTickets).innerJoin(profiles, eq(profiles.userId, supportTickets.userId))
    .where(inArray(supportTickets.status, status)).orderBy(sql`CASE WHEN ${supportTickets.severity} = 'high' THEN 0 ELSE 1 END`, asc(supportTickets.createdAt)).limit(200);
}
