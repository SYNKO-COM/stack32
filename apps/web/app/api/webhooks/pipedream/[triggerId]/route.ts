import { getServerEnv } from "@/lib/env.server";

export const runtime = "nodejs";

/**
 * Public Pipedream Connect trigger webhook.
 * Forwards the raw body + signature to the Agent Service for HMAC verification
 * and live-run enqueue.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { triggerId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(triggerId)) {
    return Response.json({ error: "invalid_trigger" }, { status: 400 });
  }
  const raw = await request.arrayBuffer();
  const { AGENT_SERVICE_URL } = getServerEnv();
  const url = `${AGENT_SERVICE_URL.replace(/\/$/, "")}/v1/webhooks/pipedream/${triggerId}`;
  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("content-type") || "application/json");
  const signature = request.headers.get("x-pd-signature");
  if (signature) headers.set("x-pd-signature", signature);
  const token = process.env.AGENT_SERVICE_INTERNAL_TOKEN;
  if (token) headers.set("X-Internal-Token", token);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: raw,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "upstream_unreachable" }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
