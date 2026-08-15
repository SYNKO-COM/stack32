#!/usr/bin/env python3
"""Live stress: create/build/run multiple agents for a real user with connections.

Uses Supabase service role + JWT minting (HS256) against local agent-service.
Does not print secrets.
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "services" / "agent-service" / ".env"
OUT = ROOT / "docs" / "pipedream" / "live_stress_report.json"
DOCS = ROOT / "docs" / "pipedream" / "LIVE_STRESS_LEARNINGS.md"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def mint_user_jwt(env: dict[str, str], user_id: str) -> str:
    """Obtain a real Supabase access token for the user (admin magiclink verify)."""
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    base = env["SUPABASE_URL"].rstrip("/")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    ur = httpx.get(f"{base}/auth/v1/admin/users/{user_id}", headers=headers, timeout=30)
    ur.raise_for_status()
    email = ur.json().get("email")
    if not email:
        raise RuntimeError(f"No email for user {user_id[:8]}")
    gl = httpx.post(
        f"{base}/auth/v1/admin/generate_link",
        headers=headers,
        json={"type": "magiclink", "email": email},
        timeout=30,
    )
    gl.raise_for_status()
    hashed = gl.json().get("hashed_token")
    if not hashed:
        raise RuntimeError("generate_link missing hashed_token")
    vr = httpx.post(
        f"{base}/auth/v1/verify",
        headers={"apikey": key, "Content-Type": "application/json"},
        json={"type": "magiclink", "token_hash": hashed},
        timeout=30,
    )
    vr.raise_for_status()
    token = vr.json().get("access_token")
    if not token:
        raise RuntimeError("verify missing access_token")
    return token


def sb_get(env: dict[str, str], path: str, params: str = "") -> list | dict:
    url = f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/{path}?{params}" if params else f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/{path}"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    r = httpx.get(
        url,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def sb_post(env: dict[str, str], path: str, body: dict) -> dict | list:
    url = f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/{path}"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    r = httpx.post(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=body,
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    return data[0] if isinstance(data, list) and data else data


AGENT_PROMPTS = [
    (
        "Stress Research Bot",
        "Build a research agent that uses web search to summarize companies. No external SaaS connections required.",
        "Summarize what Stack32 is in 3 bullets using web research if available.",
    ),
    (
        "Stress Gmail Drafter",
        "Build an agent that drafts Gmail replies (prefer draft over send) for meeting follow-ups.",
        "Draft a short polite follow-up email after a discovery call (do not send).",
    ),
    (
        "Stress Calendar Lister",
        "Build an agent that lists upcoming Google Calendar events and summarizes my week.",
        "List my upcoming calendar events for the next 7 days if connected.",
    ),
    (
        "Stress Notion Notetaker",
        "Build an agent that saves meeting notes into Notion pages. Require a configured Notion page.",
        "Explain what Notion page configuration you need before writing notes.",
    ),
    (
        "Stress Canva Designer",
        "Build an agent that creates Canva presentation designs for client meetings.",
        "Create a simple landscape Canva presentation titled Stress Test Deck if Canva is connected.",
    ),
    (
        "Stress Slack Alerts",
        "Build an agent that posts short status updates to Slack channels.",
        "What Slack channel configuration do you need before posting?",
    ),
    (
        "Stress Sheets Logger",
        "Build an agent that logs rows into Google Sheets.",
        "What spreadsheet configuration do you need before writing a row?",
    ),
    (
        "Stress Meet Prep Lite",
        "Build a meet-prep agent using Calendar, Gmail drafts, Notion notes, and Canva when connected.",
        "Prepare a brief for a fictional meeting 'Acme sync' tomorrow at 10:00 — use connected tools when possible.",
    ),
    (
        "Stress HubSpot CRM",
        "Build a CRM helper for HubSpot contacts and deals.",
        "What HubSpot fields do you need configured to update a contact?",
    ),
    (
        "Stress Linear Bugs",
        "Build an agent that creates Linear issues from bug reports.",
        "What Linear team configuration is required before creating an issue?",
    ),
    (
        "Stress GitHub Issues",
        "Build an agent that creates GitHub issues from user feedback.",
        "What repository owner/name must be configured before creating an issue?",
    ),
    (
        "Stress Stripe Invoices",
        "Build an agent that helps create Stripe invoices for customers.",
        "What Stripe customer/account config is required before invoicing?",
    ),
    (
        "Stress Docs Writer",
        "Build an agent that creates and updates Google Docs summaries.",
        "Create or describe how you would create a short Google Doc summary of today's stress test.",
    ),
    (
        "Stress Discord Announce",
        "Build an agent that posts announcements to Discord channels.",
        "What Discord channel id must be configured before posting?",
    ),
    (
        "Stress Airtable Inventory",
        "Build an agent that updates Airtable inventory bases and tables.",
        "What base and table must be configured before writing a row?",
    ),
]


def main() -> int:
    env = load_env()
    # Prefer PIPEDREAM_ALLOWED_ORIGINS as JSON list for settings if we import later
    if env.get("PIPEDREAM_ALLOWED_ORIGINS") and not env["PIPEDREAM_ALLOWED_ORIGINS"].startswith("["):
        env["PIPEDREAM_ALLOWED_ORIGINS"] = json.dumps([env["PIPEDREAM_ALLOWED_ORIGINS"]])

    conns = sb_get(
        env,
        "user_connections",
        "select=user_id,provider,account_email,status,provider_metadata,id&status=eq.active&limit=80",
    )
    assert isinstance(conns, list)
    by_user: dict[str, list] = {}
    for c in conns:
        by_user.setdefault(c["user_id"], []).append(c)
    if not by_user:
        print("No connected accounts found — cannot Live-test integrations.")
        return 2

    # Pick user with most connections
    user_id = max(by_user.keys(), key=lambda u: len(by_user[u]))
    apps = []
    for c in by_user[user_id]:
        meta = c.get("provider_metadata") or {}
        apps.append(meta.get("app_id") if isinstance(meta, dict) else None)
    print(f"user={user_id[:8]}… connections={len(by_user[user_id])} apps={apps}")

    token = mint_user_jwt(env, user_id)
    base = os.environ.get("AGENT_SERVICE_URL", "http://127.0.0.1:8000")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Ensure workspace exists
    workspaces = sb_get(env, "workspaces", f"user_id=eq.{user_id}&select=id&limit=1")
    if isinstance(workspaces, list) and workspaces:
        workspace_id = workspaces[0]["id"]
    else:
        ws = sb_post(env, "workspaces", {"user_id": user_id, "name": "Stress Workspace"})
        workspace_id = ws["id"] if isinstance(ws, dict) else None
    print("workspace", workspace_id)

    # Create agent via RPC as the real user (auth.uid())
    anon = None
    web_env = ROOT / "apps" / "web" / ".env.local"
    if web_env.exists():
        for line in web_env.read_text().splitlines():
            if line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY=") or line.startswith(
                "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="
            ):
                anon = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not anon:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local")

    def create_agent(name: str, prompt: str | None = None) -> dict:
        body: dict = {
            "p_name": name,
            "p_prompt": prompt,
            "p_create_live_thread": True,
            "p_workspace_id": workspace_id,
        }
        r = httpx.post(
            f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/rpc/create_agent_workspace",
            headers={
                "apikey": anon,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, dict) else {}

    # Template LLM secret from Meet Prep (ciphertext clone — same user encryption).
    meet_id = "f9d54b88-be72-4d82-b378-b0a92717ccaf"
    tmpl_rows = sb_get(
        env,
        "user_secrets",
        f"agent_id=eq.{meet_id}&secret_kind=eq.llm_api_key&select=provider,ciphertext,key_hint,label,metadata,user_id&limit=1",
    )
    llm_template = tmpl_rows[0] if isinstance(tmpl_rows, list) and tmpl_rows else None
    print("llm_template", bool(llm_template))

    def ensure_llm_secret(agent_id: str) -> str | None:
        if not llm_template:
            return None
        insts = sb_get(
            env,
            "agent_installations",
            f"agent_id=eq.{agent_id}&user_id=eq.{user_id}&select=id&limit=1",
        )
        installation_id = insts[0]["id"] if isinstance(insts, list) and insts else None
        payload = {
            "user_id": user_id,
            "agent_id": agent_id,
            "installation_id": installation_id,
            "provider": llm_template["provider"],
            "secret_kind": "llm_api_key",
            "ciphertext": llm_template["ciphertext"],
            "key_hint": llm_template.get("key_hint"),
            "label": llm_template.get("label") or "openai API key",
            "metadata": llm_template.get("metadata") or {},
        }
        sb_post(env, "user_secrets", payload)
        return installation_id

    def bind_available_connections(agent_id: str, tool_hints: list[str]) -> list[str]:
        """Best-effort bind active Pipedream connections for matching apps."""
        bound: list[str] = []
        blob = " ".join(tool_hints).lower()
        tool_map = {
            "gmail": ["gmail_list", "gmail_read", "gmail_create_draft", "gmail_send"],
            "calendar": ["calendar_list", "calendar_create_event"],
            "notion": ["notion"],
            "canva": ["canva"],
            "slack": ["slack"],
            "sheets": ["google_sheets"],
            "docs": ["google_docs_create", "google_docs_append"],
        }
        app_for = {
            "gmail": "gmail",
            "calendar": "google_calendar",
            "notion": "notion",
            "canva": "canva",
            "slack": "slack",
            "sheets": "google_sheets",
            "docs": "google_docs",
        }
        want_tools: dict[str, list[str]] = {}
        for token, tools in tool_map.items():
            if token in blob:
                want_tools[app_for[token]] = tools
        for c in by_user[user_id]:
            meta = c.get("provider_metadata") or {}
            app = meta.get("app_id") if isinstance(meta, dict) else None
            if not app or app not in want_tools:
                continue
            resp = httpx.post(
                f"{base}/v1/agents/{agent_id}/connections/bind",
                headers=headers,
                json={
                    "connection_id": c["id"],
                    "tool_ids": want_tools[app],
                },
                timeout=60,
            )
            if resp.status_code >= 400:
                resp = httpx.post(
                    f"{base}/v1/integrations/bindings",
                    headers=headers,
                    json={
                        "agent_id": agent_id,
                        "connection_id": c["id"],
                        "tool_ids": want_tools[app],
                    },
                    timeout=60,
                )
            bound.append(f"{app}:{resp.status_code}")
        return bound

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    prompts = AGENT_PROMPTS[offset : offset + limit]
    results: list[dict] = []

    with httpx.Client(base_url=base, headers=headers, timeout=480.0) as client:
        # health
        h = client.get("/health")
        print("health", h.status_code, h.text[:120])

        for idx, (name, build_prompt, live_prompt) in enumerate(prompts, start=1):
            row: dict = {"index": idx, "name": name, "ok_build": False, "ok_live": False}
            try:
                created = create_agent(f"{name} {uuid.uuid4().hex[:6]}")
                agent_id = created["agent_id"]
                thread_id = created.get("builder_thread_id")
                live_tid = created.get("live_thread_id")
                row["agent_id"] = agent_id
                print(f"\n[{idx}/{len(prompts)}] created {name} {agent_id[:8]}…")

                try:
                    ensure_llm_secret(agent_id)
                    print("  llm secret cloned")
                except Exception as exc:  # noqa: BLE001
                    print("  llm secret clone failed", type(exc).__name__, str(exc)[:120])

                binds = bind_available_connections(agent_id, [name, build_prompt, live_prompt])
                if binds:
                    print("  binds", binds)

                if not thread_id:
                    threads = sb_get(
                        env,
                        "builder_threads",
                        f"agent_id=eq.{agent_id}&user_id=eq.{user_id}&select=id&limit=1",
                    )
                    thread_id = threads[0]["id"] if isinstance(threads, list) and threads else None

                # Build
                t0 = time.time()
                br = client.post(
                    f"/v1/agents/{agent_id}/builder/messages",
                    json={
                        "content": build_prompt,
                        "thread_id": thread_id,
                        "locale": "en",
                        "mode": "build",
                    },
                )
                row["build_status"] = br.status_code
                row["build_secs"] = round(time.time() - t0, 1)
                bjson = {}
                try:
                    bjson = br.json()
                except Exception:
                    bjson = {"raw": br.text[:500]}
                row["build_error"] = bjson.get("error") or (
                    bjson.get("detail") if br.status_code >= 400 else None
                )
                row["ok_build"] = br.status_code < 400 and not row["build_error"]
                print("  build", br.status_code, f"{row['build_secs']}s", row.get("build_error") or "ok")

                run_id = bjson.get("run_id") if isinstance(bjson, dict) else None
                # Identity interrupt
                if isinstance(bjson, dict) and (
                    bjson.get("interrupted")
                    or bjson.get("status") == "interrupted"
                    or "identity" in str(bjson.get("ui_component") or {}).lower()
                ):
                    if run_id:
                        ir = client.post(
                            f"/v1/builder/runs/{run_id}/identity",
                            json={
                                "name": name[:80],
                                "role": "Automated stress-test agent",
                                "tone": "professional",
                                "description": "Created by live_stress_agents.py",
                            },
                        )
                        row["identity_resume"] = ir.status_code
                        print("  identity resume", ir.status_code)
                        # poll builder run completion
                        for _ in range(60):
                            time.sleep(5)
                            runs = sb_get(
                                env, "runs", f"id=eq.{run_id}&select=id,status,error_code,error_message&limit=1"
                            )
                            if isinstance(runs, list) and runs:
                                st = runs[0].get("status")
                                row["build_run_status"] = st
                                if st in {"succeeded", "completed", "failed", "canceled", "error"}:
                                    row["ok_build"] = st in {"succeeded", "completed"}
                                    break
                        print("  build run", row.get("build_run_status"))

                # If build returned a run_id and is async, poll
                elif run_id:
                    for _ in range(60):
                        time.sleep(5)
                        runs = sb_get(env, "runs", f"id=eq.{run_id}&select=id,status,error_code,error_message&limit=1")
                        if isinstance(runs, list) and runs:
                            st = runs[0].get("status")
                            row["build_run_status"] = st
                            if st in {"succeeded", "completed", "failed", "canceled", "error"}:
                                row["ok_build"] = st in {"succeeded", "completed"}
                                row["build_error"] = runs[0].get("error_message") or runs[0].get("error_code") or row.get("build_error")
                                break
                    print("  build run", row.get("build_run_status"))

                # Readiness
                rr = client.get(
                    f"/v1/agents/{agent_id}/readiness", params={"scope": "installation"}
                )
                row["readiness_status"] = rr.status_code
                try:
                    rjson = rr.json()
                    row["readiness"] = {
                        "ready": rjson.get("ready") or rjson.get("status"),
                        "missing": rjson.get("missing") or rjson.get("gates"),
                    }
                except Exception:
                    row["readiness"] = {"raw": rr.text[:300]}
                print("  readiness", rr.status_code, str(row.get("readiness"))[:160])

                if not live_tid:
                    live_threads = sb_get(
                        env,
                        "live_threads",
                        f"agent_id=eq.{agent_id}&user_id=eq.{user_id}&select=id&limit=1",
                    )
                    live_tid = (
                        live_threads[0]["id"]
                        if isinstance(live_threads, list) and live_threads
                        else None
                    )

                t1 = time.time()
                lr = client.post(
                    f"/v1/live/threads/{live_tid}/messages",
                    json={"content": live_prompt, "locale": "en", "use_published": False},
                )
                row["live_status"] = lr.status_code
                row["live_secs"] = round(time.time() - t1, 1)
                try:
                    ljson = lr.json()
                except Exception:
                    ljson = {"raw": lr.text[:500]}
                row["live_error"] = ljson.get("error") or (
                    ljson.get("detail") if lr.status_code >= 400 else None
                )
                row["live_run_id"] = ljson.get("run_id")
                row["ok_live"] = False
                run_id = ljson.get("run_id")
                if isinstance(row["live_error"], (str, dict)) and "LLM_CONFIGURATION" in str(
                    row["live_error"]
                ):
                    print("  live blocked: LLM_CONFIGURATION_REQUIRED")
                elif run_id and lr.status_code < 400:
                    for _ in range(40):
                        time.sleep(3)
                        runs = sb_get(
                            env,
                            "runs",
                            f"id=eq.{run_id}&select=id,status,error_code,error_message&limit=1",
                        )
                        if isinstance(runs, list) and runs:
                            st = runs[0].get("status")
                            row["live_run_status"] = st
                            if st in {"succeeded", "completed", "failed", "canceled", "error"}:
                                row["ok_live"] = st in {"succeeded", "completed"}
                                row["live_run_error"] = runs[0].get("error_message") or runs[
                                    0
                                ].get("error_code")
                                break
                print(
                    "  live",
                    lr.status_code,
                    f"{row['live_secs']}s",
                    row.get("live_run_status")
                    or row.get("live_error")
                    or ("ok" if row["ok_live"] else "no-run"),
                )

                msgs = sb_get(
                    env,
                    "live_messages",
                    f"thread_id=eq.{live_tid}&select=role,content,created_at&order=created_at.desc&limit=3",
                )
                if isinstance(msgs, list):
                    for m in msgs:
                        if m.get("role") == "assistant":
                            row["assistant_snippet"] = str(m.get("content") or "")[:240]
                            break

            except Exception as exc:  # noqa: BLE001
                row["exception"] = f"{type(exc).__name__}: {exc}"[:400]
                print("  EXCEPTION", row["exception"])
            results.append(row)

    report = {
        "user_id_prefix": user_id[:8],
        "apps": apps,
        "count": len(results),
        "build_ok": sum(1 for r in results if r.get("ok_build")),
        "live_ok": sum(1 for r in results if r.get("ok_live")),
        "results": results,
    }
    OUT.write_text(json.dumps(report, indent=2, default=str)[:1_500_000], encoding="utf-8")
    lines = [
        "# Live stress learnings",
        "",
        f"Agents attempted: **{report['count']}**",
        f"Build HTTP OK: **{report['build_ok']}**",
        f"Live run OK: **{report['live_ok']}**",
        f"Connected apps for user: `{apps}`",
        "",
        "## Per agent",
        "",
    ]
    for r in results:
        lines.append(
            f"- **{r.get('name')}** build={r.get('ok_build')} live={r.get('ok_live')} "
            f"readiness={r.get('readiness')} err={r.get('exception') or r.get('live_run_error') or r.get('build_error')}"
        )
        if r.get("assistant_snippet"):
            lines.append(f"  - snippet: {r['assistant_snippet'][:180]}")
    lines.extend(
        [
            "",
            "## Feed into Stack32",
            "",
            "- Failures → builder_error_lessons / playbooks",
            "- Config gaps (Notion page, Slack channel, …) reinforce app_hints.json",
            "",
        ]
    )
    DOCS.write_text("\n".join(lines), encoding="utf-8")
    print("\nSUMMARY", report["build_ok"], "/", report["count"], "build;", report["live_ok"], "/", report["count"], "live")
    print("wrote", OUT, DOCS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
