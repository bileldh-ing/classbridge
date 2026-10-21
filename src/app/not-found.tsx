import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-xl font-semibold">{t.common.notFound}</h1>
      <Link href="/" className="mt-6 inline-block text-brand-700 underline">{t.nav.home}</Link>
    </main>
  );
}
