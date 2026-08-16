/**
 * Mailpit helper for the local Supabase auth stack (CLI ≥2.x renamed Inbucket → Mailpit).
 *
 * With `enable_confirmations = true`, signup routes to /verify-email and the user
 * enters the 6-digit OTP that GoTrue delivers to Mailpit (port 54324).
 */

const MAILPIT_URL = process.env.INBUCKET_URL ?? process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitMessageSummary = {
  ID: string;
  To?: Array<{ Address?: string }>;
  Subject?: string;
};

type MailpitList = {
  messages?: MailpitMessageSummary[];
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function extractOtp(body: string): string | null {
  const match = body.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

async function listMessages(): Promise<MailpitMessageSummary[]> {
  const data = (await fetchJson(`${MAILPIT_URL}/api/v1/messages`)) as MailpitList | null;
  return Array.isArray(data?.messages) ? data.messages : [];
}

async function messageBody(id: string): Promise<string> {
  const data = (await fetchJson(`${MAILPIT_URL}/api/v1/message/${id}`)) as {
    Text?: string;
    HTML?: string;
  } | null;
  if (!data) return "";
  return `${data.Text ?? ""}\n${data.HTML ?? ""}`;
}

/** Poll Mailpit until a 6-digit signup OTP for `email` is available. */
export async function waitForSignupOtp(email: string, timeoutMs = 20_000): Promise<string> {
  const target = email.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await listMessages();
    for (const msg of messages) {
      const recipients = (msg.To ?? [])
        .map((t) => (t.Address ?? "").toLowerCase())
        .filter(Boolean);
      if (!recipients.includes(target) && !recipients.some((r) => r.includes(target.split("@")[0] ?? ""))) {
        continue;
      }
      const otp = extractOtp(await messageBody(msg.ID));
      if (otp) return otp;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`No signup OTP found in Mailpit for ${email} within ${timeoutMs}ms`);
}
