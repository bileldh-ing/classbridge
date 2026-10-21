import { getI18n } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
export const metadata = { title: "Become a teacher" };
export default async function Page() {
  const { t } = await getI18n();
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <PageHeader title={t.nav.becomeTeacher} subtitle={t.home.teacherCtaBody} />
      <Card><ol className="list-decimal space-y-2 ps-5 text-sm">
        <li>Create your account (or use your existing one — no second identity is created).</li>
        <li>Complete your profile: headline, biography, subjects, levels, languages, price, online/in-person, approximate service area and timezone.</li>
        <li>Add lesson offerings and set your weekly availability, buffers and notice period.</li>
        <li>Upload credentials to private storage for review (optional but recommended).</li>
        <li>Verify your email and submit your profile. An administrator reviews it and records a decision. Badges are only granted after explicit review.</li>
      </ol></Card>
      {user ? (user.roles.includes("teacher") ? <LinkButton href="/teach">{t.nav.overview}</LinkButton> : <ActionButton endpoint="/api/teachers/me" label={t.nav.becomeTeacher} redirectTo="/teach/profile" />)
        : <LinkButton href="/signup?next=/become-a-teacher">{t.nav.joinFree}</LinkButton>}
    </div>
  );
}
