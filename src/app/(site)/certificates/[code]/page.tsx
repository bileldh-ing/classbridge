import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { verifyCertificate } from "@/lib/services/courses";
import { Card } from "@/components/ui";
import { Award } from "lucide-react";
export const metadata = { title: "Certificate verification", robots: { index: false } };
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await verifyCertificate(getDb(), code);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="text-center">
        <Award aria-hidden className="mx-auto size-12 text-brand-600" />
        <p className="mt-2 text-sm uppercase tracking-wide text-muted">Certificate of completion</p>
        <h1 className="mt-2 text-2xl font-semibold">{c.recipientName}</h1>
        <p className="mt-1">completed <strong>{c.courseTitle}</strong></p>
        <p className="mt-4 text-sm text-muted">Issued {c.issuedAt.toISOString().slice(0, 10)} · Verification ID <span className="font-mono">{c.code}</span></p>
        <p className="mt-2 text-xs text-muted">Issued by ClassBridge after server-side verification of the course completion rules.</p>
      </Card>
    </div>
  );
}
