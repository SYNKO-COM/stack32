/**
 * Inbucket helper for the local Supabase auth stack.
 *
 * With `enable_confirmations = true`, signup no longer returns a session — the app
 * routes to /verify-email and the user must enter the 6-digit OTP that Supabase
 * delivers to Inbucket (default port 54324). This helper polls the mailbox and
 * extracts that OTP so the E2E journey can proceed deterministically.
 */

const INBUCKET_URL = process.env.INBUCKET_URL ?? "http://127.0.0.1:54324";

type InbucketMessage = { id: string; date: string };

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function mailboxCandidates(email: string): string[] {
  const local = email.split("@")[0] ?? email;
  // Inbucket keys by local part by default; some setups key by the full address.
  return Array.from(new Set([local, email]));
}

async function listMessages(mailbox: string): Promise<InbucketMessage[]> {
  const data = await fetchJson(`${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`);
  if (!Array.isArray(data)) return [];
  return data as InbucketMessage[];
}

async function messageBody(mailbox: string, id: string): Promise<string> {
  const data = (await fetchJson(
    `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${id}`,
  )) as { body?: { text?: string; html?: string } } | null;
  if (!data?.body) return "";
  return `${data.body.text ?? ""}\n${data.body.html ?? ""}`;
}

function extractOtp(body: string): string | null {
  // The confirmation template renders a standalone 6-digit code ({{ .Token }}).
  const match = body.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/** Poll Inbucket until a 6-digit signup OTP for `email` is available. */
export async function waitForSignupOtp(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const mailbox of mailboxCandidates(email)) {
      const messages = await listMessages(mailbox);
      if (messages.length > 0) {
        // Newest last in Inbucket ordering; scan from the end.
        for (const msg of [...messages].reverse()) {
          const otp = extractOtp(await messageBody(mailbox, msg.id));
          if (otp) return otp;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`No signup OTP found in Inbucket for ${email} within ${timeoutMs}ms`);
}
