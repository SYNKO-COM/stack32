/** Local browser-test fixture, NOT a production implementation or an LLM test.
 * Exercises the real draft/claim/finalize/entitlement RPCs with a deterministic
 * generated spec and no model, external integration, or real payment.
 */
import { createServer } from "node:http";

const base = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("E2E_LOCAL_ONLY");
const secret = process.env.E2E_SUPABASE_SECRET_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
async function rest(path, method = "GET", body) {
  const response = await fetch(`${base}/rest/v1/${path}`, { method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`LOCAL_FIXTURE_${response.status}`);
  return response.status === 204 ? null : response.json();
}
const fixture = brief => ({ schema_version: "5.0", identity: { name: "Agent de test", role: brief.split("\n")[0].slice(0, 240) }, goal: brief.slice(0, 4000), instructions: { system: brief }, tools: [{ tool_id: "structured_output", provider: "native", enabled: true, approval_mode: "never", config: {} }], graph: { version: "1.0", entry_node_id: "input", nodes: [{ id: "input", type: "input", name: "Demande" }, { id: "llm", type: "llm", name: "Analyse" }, { id: "output", type: "output", name: "Résultat" }], edges: [{ id: "e1", source: "input", target: "llm" }, { id: "e2", source: "llm", target: "output" }] } });
createServer(async (request, response) => {
  if (request.method === "GET") { response.end("local test fixture"); return; }
  if (request.url !== "/v1/onboarding/dispatch") { response.writeHead(404).end(); return; }
  try {
    const auth = await fetch(`${base}/auth/v1/user`, { headers: { apikey: secret, Authorization: request.headers.authorization ?? "" } });
    if (!auth.ok) { response.writeHead(401).end(); return; }
    const user = await auth.json();
    const [project] = await rest(`onboarding_projects?user_id=eq.${user.id}&select=*`);
    if (project.status === "preparing") {
      const claim = await rest("rpc/claim_onboarding_preparation", "POST", { p_run_id: project.preparation_run_id });
      if (claim?.id) await rest("rpc/finish_onboarding_preparation", "POST", { p_run_id: project.preparation_run_id, p_token: claim.lease_token, p_spec: fixture(project.brief) });
    } else if (project.status === "launched") {
      const [run] = await rest(`runs?id=eq.${project.launch_run_id}&select=*`);
      if (run.status === "queued") {
        await rest(`runs?id=eq.${run.id}`, "PATCH", { status: "completed", completed_at: new Date().toISOString(), output: { test_fixture: true } });
        await rest("live_messages", "POST", { user_id: user.id, agent_id: project.agent_id, thread_id: run.thread_id, role: "assistant", content: "Local E2E fixture: your prepared brief is retained. Connect a model to run a real task." });
      }
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "completed", test_fixture: true }));
  } catch {
    response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "LOCAL_FIXTURE_FAILED" }));
  }
}).listen(3139, "127.0.0.1");
