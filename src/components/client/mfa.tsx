"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button } from "@/components/ui";
import { JsonForm } from "./json-form";

export function MfaSetup() {
  const [data, setData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return (
    <div className="space-y-3">
      <p className="text-sm">Add ClassBridge to an authenticator app (Google Authenticator, 1Password, Aegis…). The secret is shown once.</p>
      {err && <Alert tone="error">{err}</Alert>}
      <Button onClick={async () => { try { setData(await api("/api/auth/mfa/setup", { body: {} })); } catch (e) { setErr(e instanceof ApiError ? e.message : "Error"); } }}>Start setup</Button>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm">Enter this key in your app (or open the link on your phone):</p>
      <p className="break-all rounded bg-canvas p-2 font-mono text-sm" data-testid="mfa-secret">{data.secret}</p>
      <p className="text-sm"><a className="underline" href={data.otpauthUri}>Open in authenticator app</a></p>
      <JsonForm testId="mfa-enable" endpoint="/api/auth/mfa/enable" submitLabel="Turn on two-factor" fields={[{ name: "code", label: "6-digit code from the app", required: true }]} />
    </div>
  );
}
