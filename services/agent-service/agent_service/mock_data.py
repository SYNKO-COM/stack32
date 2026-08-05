"""Test helpers / sample factories for AgentSpec V2."""

import uuid
from datetime import UTC, datetime

from agent_service.models import (
    Agent,
    AgentIdentity,
    AgentInstructions,
    AgentSpec,
    KnowledgeConfig,
    Run,
    ToolBinding,
    default_linear_graph,
)
from agent_service.models.agent_spec import AgentRule


def _now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def make_sales_research_spec() -> AgentSpec:
    tools = [
        ToolBinding(tool_id="web_search"),
        ToolBinding(tool_id="knowledge_search"),
        ToolBinding(tool_id="calculator"),
    ]
    return AgentSpec(
        identity=AgentIdentity(
            name="Sales Research Agent",
            role="Research companies and score leads",
            description="B2B sales research assistant",
            tone="professional",
        ),
        goal="Research companies, score leads and draft personalized emails",
        instructions=AgentInstructions(
            system=(
                "You are a B2B sales research assistant. Given a company name or domain, "
                "gather public information, summarize the business, score the lead from 1 to 10 "
                "and draft a short personalized outreach email."
            ),
            prohibited_actions=["Reveal secrets", "Execute shell commands"],
        ),
        tools=tools,
        knowledge=KnowledgeConfig(enabled=True, source_ids=["src_icp_notes"]),
        rules=[
            AgentRule(id="no_invent", text="Never invent missing information."),
            AgentRule(id="uncertainty", text="Clearly identify uncertainty."),
        ],
        starter_prompts=[
            "Research acme.com and score them as a lead.",
            "Draft an outreach email for the CTO of Globex.",
        ],
        graph=default_linear_graph(tools),
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
