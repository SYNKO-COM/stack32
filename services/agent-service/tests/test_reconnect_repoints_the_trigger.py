"""A reconnect must carry the tool trigger along, not just the tool bindings.

A live disconnect/reconnect cycle on Zendesk left the agent looking healthy —
badge back to Connecté, chip back to Prêt, tool binding on the new connection
— while agent_triggers still named the revoked connection. The next wake would
have listened with dead auth.
"""

import inspect

from agent_service.connections import manager


def _src():
    return inspect.getsource(manager.ConnectionManager.bind_connection)


def test_bind_reads_the_apps_identity():
    assert "provider_metadata" in _src()


def test_bind_repoints_this_agents_triggers_for_the_app():
    src = _src()
    assert "/agent_triggers" in src
    assert 'cfg["connection_id"] = connection_id' in src


def test_only_the_same_apps_triggers_are_touched():
    # A zendesk reconnect must not rewrite a hubspot trigger's auth.
    assert 'startswith(f"{app_id}-")' in _src()


def test_an_already_current_trigger_is_left_alone():
    assert 'cfg.get("connection_id") == connection_id' in _src()
