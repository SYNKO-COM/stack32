"""Structured operational work ledger (M-C).

A concise machine-readable record of the Builder run — NOT hidden chain of
thought. Supports resumability, UI progress, context compaction and debugging
(playbook §18). Serializable to JSON for persistence in run events.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    id: str
    title: str
    status: Literal["pending", "running", "done", "blocked"] = "pending"


class Blocker(BaseModel):
    kind: str
    message: str


class TestState(BaseModel):
    name: str
    status: Literal["not_run", "passed", "failed"] = "not_run"


class WorkLedger(BaseModel):
    objective: str = ""
    plan: list[PlanStep] = Field(default_factory=list)
    current_step_id: str | None = None
    facts: list[str] = Field(default_factory=list)
    blockers: list[Blocker] = Field(default_factory=list)
    files_touched: list[str] = Field(default_factory=list)
    tests: list[TestState] = Field(default_factory=list)
    next_action: str | None = None
    turn_count: int = 0
    tool_call_count: int = 0
    verification: dict[str, str] = Field(default_factory=lambda: {"lint": "pending", "tests": "pending"})

    def add_fact(self, fact: str) -> None:
        fact = fact.strip()
        if fact and fact not in self.facts:
            self.facts.append(fact[:280])
            self.facts[:] = self.facts[-40:]

    def touch(self, path: str) -> None:
        if path not in self.files_touched:
            self.files_touched.append(path)

    def set_plan(self, titles: list[str]) -> None:
        self.plan = [PlanStep(id=f"p{i + 1}", title=t) for i, t in enumerate(titles)]
        if self.plan:
            self.plan[0].status = "running"
            self.current_step_id = self.plan[0].id

    def advance_plan(self) -> None:
        for i, step in enumerate(self.plan):
            if step.status == "running":
                step.status = "done"
                if i + 1 < len(self.plan):
                    self.plan[i + 1].status = "running"
                    self.current_step_id = self.plan[i + 1].id
                else:
                    self.current_step_id = None
                return

    def summary(self) -> dict[str, Any]:
        return {
            "objective": self.objective,
            "plan": [s.model_dump() for s in self.plan],
            "current_step": self.current_step_id,
            "facts": self.facts[-10:],
            "files_touched": self.files_touched,
            "verification": self.verification,
            "turns": self.turn_count,
            "tool_calls": self.tool_call_count,
        }
