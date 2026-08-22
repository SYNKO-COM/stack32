#!/usr/bin/env python3
"""Promote auto-generated hints into curated app_hints.json (P4).

Merges entries from generated_app_hints.json that are not yet in app_hints.json.
Curated entries are never overwritten.

Usage:
  python scripts/promote_generated_hints.py --limit 100
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURATED = ROOT / "docs" / "pipedream" / "app_hints.json"
GENERATED = ROOT / "docs" / "pipedream" / "generated_app_hints.json"


def promote(*, limit: int) -> int:
    curated_raw = json.loads(CURATED.read_text(encoding="utf-8"))
    generated_raw = json.loads(GENERATED.read_text(encoding="utf-8"))
    curated_apps = curated_raw.get("apps") if isinstance(curated_raw, dict) else {}
    generated_apps = generated_raw.get("apps") if isinstance(generated_raw, dict) else {}
    if not isinstance(curated_apps, dict):
        curated_apps = {}
    if not isinstance(generated_apps, dict):
        generated_apps = {}

    added = 0
    for slug, hint in generated_apps.items():
        if added >= limit:
            break
        if slug in curated_apps or not isinstance(hint, dict):
            continue
        if not hint.get("required_static_hints") and not hint.get("auth_prop_guess"):
            continue
        promoted = dict(hint)
        promoted.pop("_auto_generated", None)
        promoted.pop("_source_action", None)
        promoted["summary"] = (
            str(promoted.get("summary") or "")
            + " (promoted from generated catalog)"
        ).strip()
        curated_apps[slug] = promoted
        added += 1

    meta = curated_raw.get("_meta") if isinstance(curated_raw, dict) else {}
    if not isinstance(meta, dict):
        meta = {}
    meta["updated"] = datetime.now(UTC).strftime("%Y-%m-%d")
    meta["promoted_batch"] = added
    curated_raw["apps"] = curated_apps
    curated_raw["_meta"] = meta
    CURATED.write_text(json.dumps(curated_raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Promoted {added} apps into {CURATED}")
    return added


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    promote(limit=args.limit)


if __name__ == "__main__":
    main()
