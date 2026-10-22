import Link from "next/link";
/** Rendered with HTTP 403 when a page calls forbidden() (e.g. non-staff opening /admin). */
export default function Forbidden() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm font-semibold text-brand-700">403</p>
      <h1 className="mt-2 text-2xl font-bold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-muted">This area is restricted. If you think this is a mistake, contact support.</p>
      <Link href="/" className="mt-6 inline-block underline">Back to home</Link>
    </main>
  );
}
