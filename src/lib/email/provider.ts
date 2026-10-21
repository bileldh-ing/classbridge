/** Email provider adapter. Resend is implemented; absence of credentials is an explicit state. */
import { env } from "../env";

export interface EmailProvider {
  name: string;
  send(msg: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}

export class ResendEmailProvider implements EmailProvider {
  name = "resend";
  constructor(private apiKey: string, private from: string) {}
  async send(msg: { to: string; subject: string; text: string; idempotencyKey: string }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id };
  }
}

export function getEmailProvider(): EmailProvider | null {
  const e = env();
  if (e.RESEND_API_KEY && e.EMAIL_FROM) return new ResendEmailProvider(e.RESEND_API_KEY, e.EMAIL_FROM);
  return null;
}
