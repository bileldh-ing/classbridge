import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lessonOfferings } from "@/lib/db/schema";
import { requireUserPage } from "@/lib/auth/session";
import { requireTeacher } from "@/lib/services/teachers";
import { listSubjects, subjectName } from "@/lib/services/catalog";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { Badge, Card, PageHeader } from "@/components/ui";
import { OfferingForm } from "@/components/forms/teacher-forms";

export default async function OfferingsPage() {
  const user = await requireUserPage("/teach/offerings");
  const { t, locale } = await getI18n();
  const db = getDb();
  const tp = await requireTeacher(db, user.id);
  const subs = (await listSubjects(db)).map((s) => ({ id: s.id, name: subjectName(s, locale) }));
  const list = await db.select().from(lessonOfferings).where(eq(lessonOfferings.teacherId, tp.id)).orderBy(desc(lessonOfferings.createdAt));
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t.nav.offerings} subtitle={`Prices in ${tp.currency} (your profile currency). Price and policy are snapshotted on each booking.`} />
      <Card><h2 className="mb-3 font-semibold">New offering</h2><OfferingForm subjects={subs} currency={tp.currency} /></Card>
      {list.map((o) => (
        <Card key={o.id}>
          <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="font-semibold">{o.title}</h3><Badge>{o.status}</Badge><Badge tone="brand">{o.priceMinor === 0 ? t.common.free : formatMoney(o.priceMinor, o.currency, locale)}</Badge></div>
          <OfferingForm id={o.id} subjects={subs} currency={o.currency} initial={o} />
        </Card>
      ))}
    </div>
  );
}
