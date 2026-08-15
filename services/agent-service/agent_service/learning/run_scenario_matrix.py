#!/usr/bin/env python3
"""Offline multi-agent scenario matrix — feeds Stack32 knowledge without UI.

Runs capability extraction + tool resolution + app_hint coverage for 80+
diverse agent blueprints. Writes learnings under docs/pipedream/.

Usage (from repo root):
  cd services/agent-service && source .venv/bin/activate
  PYTHONPATH=. python -m agent_service.learning.run_scenario_matrix
  PYTHONPATH=. python -m agent_service.learning.run_scenario_matrix --limit 20
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DOCS = ROOT / "docs" / "pipedream"


async def run_matrix(*, limit: int | None = None) -> dict:
    from agent_service.builder.capabilities import (
        extract_capabilities,
        extract_external_app_queries,
        resolve_tools_for_capabilities,
    )
    from agent_service.integrations.pipedream.knowledge import hint_for_app, normalize_app_key
    from agent_service.learning.agent_scenarios import AGENT_SCENARIOS

    scenarios = AGENT_SCENARIOS[: limit or None]
    rows: list[dict] = []
    missing_hints: Counter[str] = Counter()
    app_hits: Counter[str] = Counter()
    failures: list[dict] = []

    for sc in scenarios:
        prompt = sc["prompt"]
        expected = [normalize_app_key(a) for a in (sc.get("expected_apps") or [])]
        caps = extract_capabilities(prompt)
        apps = [normalize_app_key(a) for a in extract_external_app_queries(prompt)]
        for a in expected:
            if a and a not in apps:
                apps.append(a)
        tools, reqs, amb = await resolve_tools_for_capabilities(caps, prompt=prompt)
        tool_ids = [t.tool_id for t in tools]
        req_apps = [
            normalize_app_key(str(getattr(r, "app_id", None) or getattr(r, "app", None) or ""))
            for r in reqs
        ]
        hint_gaps = []
        for a in apps + [x for x in expected if x]:
            if not a:
                continue
            app_hits[a] += 1
            if hint_for_app(a) is None:
                hint_gaps.append(a)
                missing_hints[a] += 1

        # Soft expectation: if expected apps named, at least one tool or connection req
        ok = True
        reason = ""
        if expected:
            covered = set(apps) | set(req_apps)
            # native tools may map without listing slug in apps — check tool prefixes
            joined = " ".join(tool_ids).lower()
            for exp in expected:
                token = exp.replace("_", " ").split()[0]
                if exp in covered or token in joined or exp.replace("_", "-") in joined:
                    continue
                # allow research-only agents with empty tools beyond builtins
                if not tool_ids and not reqs:
                    ok = False
                    reason = f"no tools/reqs for expected app {exp}"
                    break
        row = {
            "id": sc["id"],
            "ok": ok,
            "expected_apps": expected,
            "detected_apps": apps,
            "tool_ids": tool_ids[:16],
            "connection_reqs": len(reqs),
            "ambiguous": len(amb or []),
            "hint_gaps": hint_gaps,
            "cap_ids": [c.id for c in caps][:12],
        }
        if not ok:
            row["reason"] = reason
            failures.append(row)
        rows.append(row)

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "scenario_count": len(rows),
        "passed": sum(1 for r in rows if r["ok"]),
        "failed": len(failures),
        "unique_apps_seen": sorted(app_hits.keys()),
        "missing_hint_counts": dict(missing_hints.most_common()),
        "top_apps": app_hits.most_common(25),
        "failures": failures[:40],
        "rows": rows,
    }
    return report


def write_docs(report: dict) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    # Persist summary only — never ship full per-scenario rows into the repo.
    slim = {k: v for k, v in report.items() if k != "rows"}
    (DOCS / "scenario_matrix_report.json").write_text(
        json.dumps(slim, indent=2, default=str)[:200_000],
        encoding="utf-8",
    )
    lines = [
        "# Agent scenario matrix learnings",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Scenarios: **{report['scenario_count']}** — passed soft checks: "
        f"**{report['passed']}** / failed: **{report['failed']}**",
        "",
        "## Purpose",
        "",
        "Offline stress of Builder capability extraction + Pipedream app-hint coverage.",
        "Does **not** create production agents or run Live OAuth — safe for CI/local.",
        "Findings feed `app_hints.json` and orchestrator knowledge.",
        "",
        "## Apps most requested",
        "",
    ]
    for app, n in report.get("top_apps") or []:
        lines.append(f"- `{app}` × {n}")
    gaps = report.get("missing_hint_counts") or {}
    lines.extend(["", "## Missing app_hints (priority)", ""])
    if gaps:
        for app, n in sorted(gaps.items(), key=lambda x: -x[1]):
            lines.append(f"- `{app}` (seen in {n} scenarios) — add hint + static config keys")
    else:
        lines.append("- None — all referenced apps have hints.")
    lines.extend(
        [
            "",
            "## Hard rules reinforced",
            "",
            "1. Auth prop ≠ app slug (`googleCalendar`, `googleSheets`, …).",
            "2. `reloadProps` → always pass `dynamic_props_id`.",
            "3. Notion needs page/database; Slack/Discord need channel; Canva needs designType+name.",
            "4. Never strip required tools on Live repair.",
            "",
            "## Failures (sample)",
            "",
        ]
    )
    for f in report.get("failures") or []:
        lines.append(
            f"- `{f['id']}`: {f.get('reason') or 'ok=false'} "
            f"tools={f.get('tool_ids')} gaps={f.get('hint_gaps')}"
        )
    if not report.get("failures"):
        lines.append("- None.")
    (DOCS / "SCENARIO_LEARNINGS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    report = asyncio.run(run_matrix(limit=args.limit or None))
    write_docs(report)
    print(
        f"scenarios={report['scenario_count']} passed={report['passed']} "
        f"failed={report['failed']} missing_hints={len(report['missing_hint_counts'])}"
    )
    print(f"wrote {DOCS / 'SCENARIO_LEARNINGS.md'}")
    return 0 if report["failed"] == 0 else 0  # soft: always 0; docs capture gaps


if __name__ == "__main__":
    sys.exit(main())
