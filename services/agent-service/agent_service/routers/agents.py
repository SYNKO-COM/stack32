"""Agent management endpoints (Phase 1: mock data only)."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agent_service.auth import CurrentUser
from agent_service.mock_data import make_mock_agent, make_mock_agents, make_mock_run, new_id
from agent_service.models import Agent, Run

router = APIRouter(prefix="/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class BuilderMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class ChatMessage(BaseModel):
    role: str
    content: str


class BuilderMessageResponse(BaseModel):
    run_id: str
    message: ChatMessage


class PublishResponse(BaseModel):
    agent_id: str
    status: str
    version_number: int


@router.get("", response_model=list[Agent])
async def list_agents(user: CurrentUser) -> list[Agent]:
    # TODO(phase-3): fetch the user's agents from Supabase.
    return make_mock_agents()


@router.post("", response_model=Agent, status_code=201)
async def create_agent(body: CreateAgentRequest, user: CurrentUser) -> Agent:
    # TODO(phase-3): persist the agent and kick off the build run.
    return make_mock_agent(name=body.name, status="draft")


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(agent_id: str, user: CurrentUser) -> Agent:
    # TODO(phase-3): load from database, 404 when missing.
    return make_mock_agent(agent_id=agent_id)


@router.post("/{agent_id}/builder/messages", response_model=BuilderMessageResponse)
async def post_builder_message(
    agent_id: str, body: BuilderMessageRequest, user: CurrentUser
) -> BuilderMessageResponse:
    # TODO(phase-2): route the message to the builder LLM (LangGraph) and
    # stream progress through the run events channel.
    return BuilderMessageResponse(
        run_id=new_id("run"),
        message=ChatMessage(
            role="assistant",
            content=(
                "Got it! I'll set up an agent that can do that. "
                "I'm selecting the right tools and drafting its instructions now — "
                "you can watch the progress in the build panel."
            ),
        ),
    )


@router.post("/{agent_id}/test", response_model=Run)
async def test_agent(agent_id: str, user: CurrentUser) -> Run:
    # TODO(phase-2): execute a real test run against the agent runtime.
    return make_mock_run(agent_id=agent_id, kind="test", status="succeeded")


@router.post("/{agent_id}/repair", response_model=Run)
async def repair_agent(agent_id: str, user: CurrentUser) -> Run:
    # TODO(phase-2): run the repair loop on the latest failing version.
    return make_mock_run(agent_id=agent_id, kind="repair", status="queued")


@router.post("/{agent_id}/publish", response_model=PublishResponse)
async def publish_agent(agent_id: str, user: CurrentUser) -> PublishResponse:
    # TODO(phase-3): snapshot the current draft version and mark it published.
    return PublishResponse(agent_id=agent_id, status="published", version_number=2)
