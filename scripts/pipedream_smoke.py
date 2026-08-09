#!/usr/bin/env python3
"""Opt-in Pipedream Connect smoke (network). Not run in CI.

Usage:
  export PIPEDREAM_CLIENT_ID=...
  export PIPEDREAM_CLIENT_SECRET=...
  export PIPEDREAM_PROJECT_ID=...
  python scripts/pipedream_smoke.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-service"))


async def main() -> int:
    required = ("PIPEDREAM_CLIENT_ID", "PIPEDREAM_CLIENT_SECRET", "PIPEDREAM_PROJECT_ID")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing env: {', '.join(missing)}")
        return 2

    from agent_service.integrations.pipedream.client import PipedreamClient

    client = PipedreamClient()
    token = await client.get_access_token()
    print("access_token:", "ok" if token else "missing")
    connect = await client.create_connect_token(external_user_id="smoke-user")
    print("connect_token keys:", sorted(connect.keys()) if isinstance(connect, dict) else connect)
    apps = await client.search_apps("gmail", limit=3)
    print("apps:", len(apps) if isinstance(apps, list) else apps)
    return 0 if token else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
