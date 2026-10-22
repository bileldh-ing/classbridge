/**
 * Messaging. Conversations exist only between a student and a teacher who share a booking
 * (anti-spam rule). Membership is verified on every read/write; blocked members cannot send.
 */
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DB } from "../db";
import { bookings, conversationMembers, conversations, messageAttachments, messages, profiles, teacherProfiles } from "../db/schema";
import { MAX_UPLOAD_BYTES, putPrivateFile, safeFileName, sniffFile } from "../storage";
import { AppError } from "../errors";
import type { Principal } from "../auth/permissions";
import { notify } from "./notify";
import { rateLimit } from "./rate-limit";

export const messageSchema = z.object({ body: z.string().trim().min(1, "required").max(4000) });

export async function canStartConversation(db: DB, studentId: string, teacherUserId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings).innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId))
    .where(and(eq(bookings.studentId, studentId), eq(teacherProfiles.userId, teacherUserId), ne(bookings.status, "draft")));
  return r.n > 0;
}

export async function openConversationForBooking(db: DB, actor: Principal, bookingId: string) {
  const [row] = await db.select({ b: bookings, teacherUserId: teacherProfiles.userId }).from(bookings).innerJoin(teacherProfiles, eq(teacherProfiles.id, bookings.teacherId)).where(eq(bookings.id, bookingId));
  if (!row || (row.b.studentId !== actor.id && row.teacherUserId !== actor.id)) throw new AppError("NOT_FOUND", "Booking not found.");
  const [c] = await db.insert(conversations).values({ studentId: row.b.studentId, teacherUserId: row.teacherUserId })
    .onConflictDoUpdate({ target: [conversations.studentId, conversations.teacherUserId], set: { studentId: row.b.studentId } }).returning();
  await db.insert(conversationMembers).values([{ conversationId: c.id, userId: row.b.studentId }, { conversationId: c.id, userId: row.teacherUserId }]).onConflictDoNothing();
  return c;
}

async function membership(db: DB, userId: string, conversationId: string) {
  const [m] = await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  if (!m) throw new AppError("NOT_FOUND", "Conversation not found.");
  return m;
}

export async function listConversations(db: DB, actor: Principal) {
  return db.execute<{ id: string; other_name: string; last_message_at: Date | null; unread: number; preview: string | null }>(sql`
    SELECT c.id, op.display_name AS other_name, c.last_message_at,
      (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ${actor.id} AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at)) AS unread,
      (SELECT left(m.body, 80) FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview
    FROM conversation_members me
    JOIN conversations c ON c.id = me.conversation_id
    JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id <> ${actor.id}
    JOIN profiles op ON op.user_id = other.user_id
    WHERE me.user_id = ${actor.id}
    ORDER BY c.last_message_at DESC NULLS LAST`).then((r) => r.rows);
}

export async function getMessages(db: DB, actor: Principal, conversationId: string, after?: Date) {
  await membership(db, actor.id, conversationId);
  const rows = await db.select({ id: messages.id, body: messages.body, senderId: messages.senderId, createdAt: messages.createdAt, senderName: profiles.displayName })
    .from(messages).innerJoin(profiles, eq(profiles.userId, messages.senderId))
    .where(and(eq(messages.conversationId, conversationId), after ? gt(messages.createdAt, after) : sql`true`))
    .orderBy(desc(messages.createdAt)).limit(100);
  await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, actor.id)));
  return rows.reverse();
}

export async function sendMessage(db: DB, actor: Principal, conversationId: string, body: string) {
  const me = await membership(db, actor.id, conversationId);
  const [other] = await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, actor.id)));
  if (me.blockedAt || other?.blockedAt) throw new AppError("FORBIDDEN", "Messaging is blocked in this conversation.");
  const rl = await rateLimit(db, `msg:${actor.id}`, 30, 60);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "You are sending messages too quickly.");
  const [m] = await db.insert(messages).values({ conversationId, senderId: actor.id, body }).returning();
  await db.update(conversations).set({ lastMessageAt: m.createdAt }).where(eq(conversations.id, conversationId));
  if (other) await notify(db, { userId: other.userId, kind: "message", title: "New message", body: "You have a new message.", link: `/messages/${conversationId}`, dedupeKey: `message:${m.id}` });
  return m;
}

/** Blocking sets blocked_at on the blocker's membership; either side being blocked stops sending. */
export async function setBlocked(db: DB, actor: Principal, conversationId: string, blocked: boolean) {
  await membership(db, actor.id, conversationId);
  await db.update(conversationMembers).set({ blockedAt: blocked ? new Date() : null }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, actor.id)));
}

export async function conversationHeader(db: DB, actor: Principal, conversationId: string) {
  const me = await membership(db, actor.id, conversationId);
  const [o] = await db.select({ name: profiles.displayName, blockedAt: conversationMembers.blockedAt }).from(conversationMembers).innerJoin(profiles, eq(profiles.userId, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, actor.id)));
  return { otherName: o?.name ?? "—", iBlocked: !!me.blockedAt, blocked: !!me.blockedAt || !!o?.blockedAt };
}

// ------------------------------------------------------------------ attachments
export const ATTACHMENT_TYPES = ["pdf", "png", "jpg", "webp"] as const;

/**
 * Sends a message with one attachment. Type is decided from magic bytes (PDF/PNG/JPEG/WebP), size ≤ 5 MB, stored in
 * private storage under a random key; downloads go through a membership-checked route.
 */
export async function sendAttachment(db: DB, actor: Principal, conversationId: string, file: { name: string; bytes: Buffer }, caption?: string) {
  if (file.bytes.length === 0) throw new AppError("VALIDATION_FAILED", "Empty file.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION_FAILED", "File too large (max 5 MB).");
  const kind = sniffFile(file.bytes, ATTACHMENT_TYPES);
  if (!kind) throw new AppError("VALIDATION_FAILED", "Only PDF, PNG, JPEG or WebP files can be attached.");
  const name = safeFileName(file.name, kind.ext);
  const key = `messages/${conversationId}/${randomUUID()}.${kind.ext}`;
  // Membership/blocking/rate limits are enforced by sendMessage before anything is stored.
  const m = await sendMessage(db, actor, conversationId, (caption?.trim() || `📎 ${name}`).slice(0, 4000));
  await putPrivateFile(key, file.bytes);
  const [a] = await db.insert(messageAttachments).values({ messageId: m.id, conversationId, uploaderId: actor.id, storageKey: key, mime: kind.mime, sizeBytes: file.bytes.length, originalName: name }).returning();
  return { message: m, attachment: { id: a.id, name, mime: a.mime, sizeBytes: a.sizeBytes } };
}

export async function getAttachmentForMember(db: DB, actor: Principal, attachmentId: string) {
  const [a] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, attachmentId));
  if (!a) throw new AppError("NOT_FOUND", "Attachment not found.");
  await membership(db, actor.id, a.conversationId);
  return a;
}

export async function attachmentsFor(db: DB, messageIds: string[]) {
  if (!messageIds.length) return [];
  return db.select({ id: messageAttachments.id, messageId: messageAttachments.messageId, name: messageAttachments.originalName, mime: messageAttachments.mime, sizeBytes: messageAttachments.sizeBytes })
    .from(messageAttachments).where(inArray(messageAttachments.messageId, messageIds));
}

/** Exposed for the realtime stream: throws NOT_FOUND unless the user is a member. */
export async function assertMember(db: DB, userId: string, conversationId: string) {
  await membership(db, userId, conversationId);
}
