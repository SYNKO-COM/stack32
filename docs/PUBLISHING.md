# Publishing

`POST /v1/agents/{id}/publish` requires:

1. Ownership
2. Valid AgentSpec V2 + GraphSpec
3. Successful compile
4. Draft version test_status in `passed` | `passed_with_warnings`
5. Immutable `agent_deployments` row (`status=active`)
6. Audit event

Unpublish disables deployment and clears `published_version_id`.

Published agents run through the hosted Agent API / queue — creator laptop not required.
