import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUserPage } from "@/lib/auth/session";
import { attachmentsFor, conversationHeader, getMessages } from "@/lib/services/messaging";
import { isAppError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { Thread } from "@/components/forms/thread";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/messages/${id}`);
  let head, msgs;
  try { head = await conversationHeader(getDb(), user, id); msgs = await getMessages(getDb(), user, id); }
  catch (e) { if (isAppError(e) && e.code === "NOT_FOUND") notFound(); throw e; }
  const atts = await attachmentsFor(getDb(), msgs.map((m) => m.id));
  return (
    <div className="max-w-3xl">
      <PageHeader title={head.otherName} />
      <Thread conversationId={id} blocked={head.blocked} iBlocked={head.iBlocked}
        initial={msgs.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === user.id, senderName: m.senderName, createdAt: m.createdAt.getTime(),
          attachments: atts.filter((a) => a.messageId === m.id).map((a) => ({ id: a.id, name: a.name, mime: a.mime, sizeBytes: a.sizeBytes })) }))} />
    </div>
  );
}
