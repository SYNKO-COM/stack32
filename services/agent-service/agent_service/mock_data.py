"""Mock data factories for Phase 1.

# TODO(phase-3): remove this module once agents/runs are persisted in Supabase.
"""

import uuid
from datetime import UTC, datetime

from agent_service.models import Agent, AgentSpec, KnowledgeConfig, ModelProfile, Run, ToolConfig


def _now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def make_sales_research_spec() -> AgentSpec:
    """A realistic sample AgentSpec used across mock responses."""
    return AgentSpec(
        name="Sales Research Agent",
        slug="sales-research-agent",
        goal="Research companies, score leads and draft personalized emails",
        instructions=(
            "You are a B2B sales research assistant. Given a company name or domain, "
            "gather public information, summarize the business, score the lead from 1 to 10 "
            "and draft a short personalized outreach email."
        ),
        model_profile=ModelProfile(profile="standard", temperature=0.4),
        tools=[
            ToolConfig(tool="web_search"),
            ToolConfig(tool="knowledge_search"),
            ToolConfig(tool="calculator"),
        ],
        knowledge=KnowledgeConfig(enabled=True, source_ids=["src_icp_notes"]),
        rules=[
            "Never invent missing information.",
            "Clearly identify uncertainty.",
        ],
        starter_prompts=[
            "Research acme.com and score them as a lead.",
            "Draft an outreach email for the CTO of Globex.",
        ],
    )


def make_mock_agent(
    agent_id: str | None = None,
    name: str = "Sales Research Agent",
    status: str = "ready",
) -> Agent:
    now = _now()
    return Agent.model_validate(
        {
            "id": agent_id or new_id("agent"),
            "name": name,
            "status": status,
            "created_at": now,
            "updated_at": now,
        }
    )


def make_mock_agents() -> list[Agent]:
    return [
        make_mock_agent(agent_id="agent_mock000001", name="Sales Research Agent", status="ready"),
        make_mock_agent(agent_id="agent_mock000002", name="Support FAQ Agent", status="published"),
        make_mock_agent(agent_id="agent_mock000003", name="Weekly Report Agent", status="draft"),
    ]


def make_mock_run(agent_id: str, kind: str, status: str = "succeeded") -> Run:
    return Run.model_validate(
        {
            "id": new_id("run"),
            "agent_id": agent_id,
            "kind": kind,
            "status": status,
            "created_at": _now(),
        }
    )
