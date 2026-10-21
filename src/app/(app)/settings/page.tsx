import { requireUserPage } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Card, PageHeader } from "@/components/ui";
import { ProfileForm, PasswordForm } from "@/components/forms/settings-forms";
import { ActionButton } from "@/components/client/action-button";

export default async function SettingsPage() {
  const user = await requireUserPage("/settings");
  const { t } = await getI18n();
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={t.settings.title} />
      <Card><h2 className="mb-3 font-semibold">{t.settings.profile}</h2><ProfileForm displayName={user.displayName} timezone={user.timezone} /></Card>
      <Card><h2 className="mb-3 font-semibold">{t.settings.security}</h2><PasswordForm />
        <div className="mt-4 border-t border-line pt-4"><ActionButton endpoint="/api/auth/logout-all" label={t.settings.logoutAll} variant="secondary" successText={t.common.saved} /></div></Card>
      <Card><h2 className="mb-3 font-semibold">{t.settings.privacy}</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton endpoint="/api/privacy" body={{ kind: "export" }} label={t.settings.exportData} variant="secondary" successText={t.settings.requestSent} />
          <ActionButton endpoint="/api/privacy" body={{ kind: "deletion" }} label={t.settings.deleteAccount} variant="danger" confirmText={t.settings.deleteAccount + "?"} successText={t.settings.requestSent} />
        </div></Card>
    </div>
  );
}
