"""A new agent starts with the model its owner already uses.

Relance Factures finished building with spec.model null: the builder never
sets it, and the old restore only fired when this very agent had once
validated a pasted BYOK key. In the Pipedream world the OpenAI account is
account-level, so the brain check failed on every fresh build and the person
was asked to re-pick the model they had already chosen elsewhere.
"""

import inspect


def test_the_route_falls_back_across_agents():
    from agent_service.routers import agents

    src = inspect.getsource(agents)
    assert "latest_model_config_across_agents" in src
    # The BYOK restore stays first; the cross-agent copy only fills silence.
    assert src.index("latest_valid_model_config(") < src.index(
        "latest_model_config_across_agents(user_id"
    )


def test_the_helper_reads_only_this_users_agents():
    from agent_service.security import user_secrets

    src = inspect.getsource(user_secrets.latest_model_config_across_agents)
    assert '"user_id": f"eq.{user_id}"' in src
    assert '"deleted_at": "is.null"' in src


def test_the_helper_requires_a_complete_model():
    from agent_service.security import user_secrets

    src = inspect.getsource(user_secrets.latest_model_config_across_agents)
    assert 'model.get("provider")' in src and 'model.get("model_id")' in src
