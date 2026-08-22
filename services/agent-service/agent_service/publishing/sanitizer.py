"""Publish sanitizer — reject secret-bearing / installation-specific fields in published specs."""

from __future__ import annotations

from typing import Any

# Structured field names that must never appear in a published definition snapshot.
BANNED_SECRET_KEYS = frozenset(
    {
        "api_key",
        "apiKey",
        "apikey",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "auth_provision_id",
        "authProvisionId",
        "connection_id",
        "connectionId",
        "ciphertext",
        "encrypted_conn_ref",
        "encryptedConnRef",
        "password",
        "secret",
        "client_secret",
        "clientSecret",
        "postgres_url",
        "database_url",
        "DATABASE_URL",
        "connection_string",
        "connectionString",
        "dsn",
        "smtp_password",
        "external_account_id",
        "externalAccountId",
    }
)

# Account-specific static config keys that belong on Installation, not Template.
ACCOUNT_SPECIFIC_CONFIG_KEYS = frozenset(
    {
        "channel",
        "channelId",
        "channel_id",
        "calendarId",
        "calendar_id",
        "spreadsheetId",
        "spreadsheet_id",
        "sheetId",
        "sheet_id",
        "worksheetId",
        "worksheet_id",
        "databaseId",
        "database_id",
        "pipeline",
        "pipelineId",
        "pipeline_id",
        "workspaceId",
        "workspace_id",
        "teamId",
        "team_id",
        "accountId",
        "account_id",
    }
)


class PublishSanitizeError(Exception):
    def __init__(self, code: str, details: list[str] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or []


def _walk_banned(obj: Any, path: str, hits: list[str]) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_str = str(key)
            child = f"{path}.{key_str}" if path else key_str
            if key_str in BANNED_SECRET_KEYS:
                hits.append(child)
                continue
            # Non-empty connection_bindings are installation data.
            if key_str in {"connection_bindings", "connectionBindings"} and value:
                hits.append(child)
                continue
            if key_str == "config" and isinstance(value, dict):
                for ck in value:
                    if str(ck) in ACCOUNT_SPECIFIC_CONFIG_KEYS and value[ck] not in (None, "", []):
                        hits.append(f"{child}.{ck}")
            _walk_banned(value, child, hits)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _walk_banned(item, f"{path}[{idx}]", hits)


def sanitize_definition_spec(spec: dict[str, Any] | Any) -> dict[str, Any]:
    """Return a portable copy of the definition spec; raise if secrets remain.

    Strips known installation fields when empty-safe; rejects unexpected secret payloads.
    """
    if hasattr(spec, "model_dump"):
        data = spec.model_dump(mode="json")
    else:
        data = dict(spec)

    # Reject secret-bearing fields on the *incoming* snapshot before stripping.
    pre_hits: list[str] = []
    _walk_banned(data, "", pre_hits)
    if pre_hits:
        raise PublishSanitizeError("PUBLISH_SECRET_LEAK", pre_hits)

    # Always strip installation bindings from published template.
    data["connection_bindings"] = []

    # External memory config id is installation-owned.
    memory = data.get("memory")
    if isinstance(memory, dict):
        memory = {**memory, "external_config_id": None}
        data["memory"] = memory

    # Tool configs: drop account-specific static keys; keep portable approval flags etc.
    tools = data.get("tools")
    if isinstance(tools, list):
        cleaned_tools = []
        for tool in tools:
            if not isinstance(tool, dict):
                cleaned_tools.append(tool)
                continue
            cfg = tool.get("config")
            if isinstance(cfg, dict):
                cfg = {
                    k: v
                    for k, v in cfg.items()
                    if str(k) not in ACCOUNT_SPECIFIC_CONFIG_KEYS
                    and str(k) not in BANNED_SECRET_KEYS
                }
                tool = {**tool, "config": cfg}
            cleaned_tools.append(tool)
        data["tools"] = cleaned_tools

    return data


def assert_portable_definition(spec: dict[str, Any] | Any) -> dict[str, Any]:
    """Alias used by PublishService — sanitize + assert."""
    return sanitize_definition_spec(spec)
