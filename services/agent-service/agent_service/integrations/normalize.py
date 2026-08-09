"""Normalized catalog tool / tool reference shapes for hybrid providers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CatalogTool:
    tool_id: str
    name: str
    summary: str
    provider: str  # native|pipedream|custom_api
    provider_tool_id: str | None
    provider_app_id: str | None
    risk: str
    side_effect: bool
    auth_type: str
    connection_required: bool
    approval_mode: str
    keywords: list[str]
    categories: list[str]
    input_schema: dict[str, Any]
    version: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def brief(self) -> dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "name": self.name,
            "summary": self.summary,
            "provider": self.provider,
            "provider_tool_id": self.provider_tool_id,
            "provider_app_id": self.provider_app_id,
            "risk": self.risk,
            "side_effect": self.side_effect,
            "auth_type": self.auth_type,
            "connection_required": self.connection_required,
            "approval_mode": self.approval_mode,
            "keywords": list(self.keywords),
            "categories": list(self.categories),
            "version": self.version,
        }


@dataclass
class ToolRef:
    tool_id: str
    provider: str
    provider_tool_id: str | None = None
    provider_app_id: str | None = None
    version: str | None = None
