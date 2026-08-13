#!/usr/bin/env python3
"""Opt-in Pipedream Connect smoke (network). Not run in CI.

Usage:
  export PIPEDREAM_CLIENT_ID=...
  export PIPEDREAM_CLIENT_SECRET=...
  export PIPEDREAM_PROJECT_ID=...
  python scripts/pipedream_smoke.py
  python scripts/pipedream_smoke.py --full
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-service"))


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full",
        action="store_true",
        help="Also normalize a Slack action schema and list accounts",
    )
    args = parser.parse_args()

    # Load agent-service .env if present (before required-env check).
    env_path = ROOT / "services" / "agent-service" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    required = ("PIPEDREAM_CLIENT_ID", "PIPEDREAM_CLIENT_SECRET", "PIPEDREAM_PROJECT_ID")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing env: {', '.join(missing)}")
        return 2

    from agent_service.integrations.pipedream.client import PipedreamClient
    from agent_service.integrations.pipedream.schema import normalize_configurable_props

    client = PipedreamClient()
    token = await client.get_access_token()
    print("access_token:", "ok" if token else "missing")
    connect = await client.create_connect_token(external_user_id="smoke-user")
    print("connect_token keys:", sorted(connect.keys()) if isinstance(connect, dict) else connect)
    apps = await client.search_apps("slack", limit=3)
    print("apps:", [(a.get("app_id"), a.get("name")) for a in apps[:3]])
    actions = await client.search_actions("send-message", limit=5)
    if not actions:
        actions = await client.search_actions("slack", limit=5)
    print("actions:", [(a.get("action_id"), a.get("name")) for a in actions[:5]])

    if args.full:
        key = str((actions[0].get("action_id") if actions else "") or "slack_v2-send-message-to-channel")
        component = await client.get_component(key)
        if not component:
            print("component: missing for", key)
            return 1
        schema = normalize_configurable_props(component, tool_id=f"pd:{key}", action_id=key)
        llm = schema.llm_json_schema()
        print("normalized auth_prop:", schema.auth_prop_name)
        print("llm properties:", sorted((llm.get("properties") or {}).keys()))
        assert schema.auth_prop_name
        assert schema.auth_prop_name not in (llm.get("properties") or {})
        accounts = await client.list_accounts(external_user_id="smoke-user", app="slack")
        print("accounts for smoke-user:", len(accounts))
        print(
            "NOTE: run-action / Live execute require a real connected Slack account "
            "bound to a Stack32 agent — do that in the UI, not CI."
        )

    return 0 if token else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
