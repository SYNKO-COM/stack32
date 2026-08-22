#!/usr/bin/env python3
"""Batch-enrich Pipedream app hints from live component schemas.

Discovers apps via paginated ``/apps`` (full ~3200+ catalog), loads one
representative action per app, and writes ``docs/pipedream/generated_app_hints.json``.
Curated ``app_hints.json`` always wins at runtime.

Usage (requires Pipedream credentials in env):
  cd services/agent-service
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --limit 3500
  PYTHONPATH=. python ../../scripts/enrich_pipedream_catalog.py --all
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

CHECKPOINT_EVERY = 50


async def _discover_apps(client, *, limit: int, offset: int) -> list[dict]:
    """Full catalog pagination; slice with offset/limit for parallel workers."""
    need = limit + offset if limit else None
    all_apps = await client.list_all_apps(max_apps=need)
    if offset:
        all_apps = all_apps[offset:]
    if limit:
        all_apps = all_apps[:limit]
    return all_apps


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
        if hint:
            return slug, hint
    return slug, None


def _load_existing() -> dict[str, dict]:
    if not OUTPUT.exists():
        return {}
    try:
        raw = json.loads(OUTPUT.read_text(encoding="utf-8"))
        apps = raw.get("apps") if isinstance(raw, dict) else {}
        return apps if isinstance(apps, dict) else {}
    except json.JSONDecodeError:
        return {}


def _write_payload(existing: dict[str, dict], *, batch_count: int, errors: int) -> None:
    payload = {
        "_meta": {
            "purpose": "Auto-generated app hints from Pipedream component schemas",
            "updated": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "app_count": len(existing),
            "batch_apps": batch_count,
            "errors": errors,
            "discovery": "paginated /apps API (full catalog)",
        },
        "apps": existing,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def enrich(*, limit: int | None, offset: int, concurrency: int) -> dict:
    from agent_service.integrations.pipedream.client import PipedreamClient
    from agent_service.integrations.pipedream.provider import PipedreamToolProvider

    client = PipedreamClient()
    if not client.configured():
        print("ERROR: Pipedream credentials missing (PIPEDREAM_CLIENT_ID/SECRET/PROJECT_ID)", file=sys.stderr)
        sys.exit(1)

    provider = PipedreamToolProvider()
    effective_limit = limit or 10_000
    apps = await _discover_apps(client, limit=effective_limit, offset=offset)
    print(f"Discovered {len(apps)} apps (offset={offset}, limit={limit or 'all'})", flush=True)

    existing = _load_existing()
    hints_this_batch = 0
    errors: list[str] = []
    sem = asyncio.Semaphore(max(1, concurrency))
    processed = 0

    async def _one(app_row: dict) -> None:
        nonlocal hints_this_batch, processed
        async with sem:
            try:
                slug, hint = await _hint_for_app(client, provider, app_row)
                if slug and hint:
                    if slug not in existing:
                        hints_this_batch += 1
                    existing[slug] = hint
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{app_row.get('app_id')}: {exc}")
            processed += 1
            if processed % CHECKPOINT_EVERY == 0:
                _write_payload(existing, batch_count=hints_this_batch, errors=len(errors))
                print(
                    f"  checkpoint {processed}/{len(apps)} "
                    f"(total hints {len(existing)}, new this run {hints_this_batch})",
                    flush=True,
                )

    await asyncio.gather(*[_one(row) for row in apps])

    _write_payload(existing, batch_count=hints_this_batch, errors=len(errors))
    print(f"Wrote {hints_this_batch} new/updated hints → {OUTPUT} (total {len(existing)} apps)", flush=True)
    if errors:
        print(f"Errors: {len(errors)} (first: {errors[0]})", file=sys.stderr)
    return {"app_count": len(existing), "batch": hints_this_batch, "errors": len(errors)}


def main() -> None:
    import os

    os.environ.setdefault("PIPEDREAM_ALLOWED_ORIGINS", "[]")
    parser = argparse.ArgumentParser(description="Enrich Pipedream generated_app_hints.json")
    parser.add_argument("--limit", type=int, default=None, help="Max apps to process (default: all catalog)")
    parser.add_argument("--all", action="store_true", help="Process entire catalog (~3200 apps)")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N discovered apps")
    parser.add_argument("--concurrency", type=int, default=4, help="Parallel API calls")
    args = parser.parse_args()
    limit = None if args.all or args.limit is None else args.limit
    if args.all:
        limit = None
    asyncio.run(enrich(limit=limit, offset=args.offset, concurrency=args.concurrency))


if __name__ == "__main__":
    main()
