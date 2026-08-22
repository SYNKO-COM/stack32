#!/usr/bin/env python3
"""Batch-enrich Pipedream app hints from live component schemas.

Discovers apps via the Pipedream API, loads one representative action per app,
and writes ``docs/pipedream/generated_app_hints.json``. Curated ``app_hints.json``
always wins at runtime — this file fills the long tail.

Usage (requires Pipedream credentials in env):
  cd services/agent-service
  source .venv/bin/activate
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 200
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 3000 --concurrency 4

Multi-agent / overnight: run several processes with disjoint ``--offset`` slices:
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 1000 --offset 0
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 1000 --offset 1000
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 1000 --offset 2000
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "pipedream"
OUTPUT = DOCS / "generated_app_hints.json"

# Alphabet + common SaaS seeds to maximize app discovery without a paginated /apps API.
_DISCOVERY_SEEDS = [
    "",
    *list("abcdefghijklmnopqrstuvwxyz"),
    "google",
    "microsoft",
    "slack",
    "notion",
    "stripe",
    "hubspot",
    "salesforce",
    "shopify",
    "airtable",
    "github",
    "jira",
    "linear",
    "discord",
    "twilio",
    "openai",
]


async def _discover_apps(client, *, limit: int) -> list[dict]:
    seen: dict[str, dict] = {}
    for seed in _DISCOVERY_SEEDS:
        if len(seen) >= limit:
            break
        rows = await client.search_apps(seed, limit=50)
        for row in rows:
            slug = str(row.get("app_id") or "").strip().lower().replace("-", "_")
            if not slug or slug in seen:
                continue
            seen[slug] = row
            if len(seen) >= limit:
                break
    return list(seen.values())


async def _hint_for_app(client, provider, app_row: dict) -> tuple[str, dict | None]:
    from agent_service.integrations.pipedream.auto_hints import hint_from_component
    from agent_service.integrations.pipedream.knowledge import normalize_app_key

    slug = normalize_app_key(str(app_row.get("app_id") or ""))
    if not slug:
        return "", None

    actions = await client.search_actions(slug, limit=3)
    if not actions:
        return slug, None

    for action in actions:
        action_id = str(action.get("action_id") or action.get("key") or "")
        if not action_id:
            continue
        component = await provider._load_component(action_id)  # noqa: SLF001
        if not component:
            continue
        hint = hint_from_component(
            component,
            tool_id=f"pd:{action_id}",
            action_id=action_id,
        )
        if hint and hint.get("required_static_hints"):
            return slug, hint
        if hint:
            return slug, hint
    return slug, None


async def enrich(*, limit: int, offset: int, concurrency: int) -> dict:
    from agent_service.integrations.pipedream.client import PipedreamClient
    from agent_service.integrations.pipedream.provider import PipedreamToolProvider

    client = PipedreamClient()
    if not client.configured():
        print("ERROR: Pipedream credentials missing (PIPEDREAM_CLIENT_ID/SECRET/PROJECT_ID)", file=sys.stderr)
        sys.exit(1)

    provider = PipedreamToolProvider()
    apps = await _discover_apps(client, limit=limit + offset)
    apps = apps[offset : offset + limit]
    print(f"Discovered {len(apps)} apps (offset={offset}, limit={limit})")

    sem = asyncio.Semaphore(max(1, concurrency))
    hints: dict[str, dict] = {}
    errors: list[str] = []

    async def _one(app_row: dict) -> None:
        async with sem:
            try:
                slug, hint = await _hint_for_app(client, provider, app_row)
                if slug and hint:
                    hints[slug] = hint
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{app_row.get('app_id')}: {exc}")

    await asyncio.gather(*[_one(row) for row in apps])

    # Merge with existing generated file (never drop prior batch work)
    existing: dict = {}
    if OUTPUT.exists():
        try:
            raw = json.loads(OUTPUT.read_text(encoding="utf-8"))
            existing = raw.get("apps") if isinstance(raw, dict) else {}
            if not isinstance(existing, dict):
                existing = {}
        except json.JSONDecodeError:
            existing = {}

    existing.update(hints)
    payload = {
        "_meta": {
            "purpose": "Auto-generated app hints from Pipedream component schemas",
            "updated": datetime.now(UTC).strftime("%Y-%m-%d"),
            "app_count": len(existing),
            "batch_apps": len(hints),
            "errors": len(errors),
        },
        "apps": existing,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(hints)} new hints → {OUTPUT} (total {len(existing)} apps)")
    if errors:
        print(f"Errors: {len(errors)} (first: {errors[0]})", file=sys.stderr)
    return payload


def main() -> None:
    import os

    # Tolerate malformed PIPEDREAM_ALLOWED_ORIGINS in local .env during batch runs.
    os.environ.setdefault("PIPEDREAM_ALLOWED_ORIGINS", "[]")
    parser = argparse.ArgumentParser(description="Enrich Pipedream generated_app_hints.json")
    parser.add_argument("--limit", type=int, default=100, help="Max apps to process in this batch")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N discovered apps")
    parser.add_argument("--concurrency", type=int, default=3, help="Parallel API calls")
    args = parser.parse_args()
    asyncio.run(enrich(limit=args.limit, offset=args.offset, concurrency=args.concurrency))


if __name__ == "__main__":
    main()
