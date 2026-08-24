"""Readiness must ask only for settings the action actually has.

A freshly built agent showed a card demanding eight Airtable actions be
configured, while the one thing stopping it — a Trello trigger with no board
chosen — was never mentioned. Two separate defects sat behind that:

1. A curated per-app hint was applied to every action of the app. Trello's hint
   names `checklistItemId`, so `trello-search-boards`, which has no such field,
   counted as missing a setting no form could ever fill. The agent could never
   become ready and listening could never start.

2. The trigger's own required settings were not checked at all.
"""

import inspect

from agent_service.readiness import evaluator


class TestTheCuratedHintCannotInventFields:
    def test_a_hint_key_must_be_declared_by_the_action(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        # The guard reads the action's own declared static properties and only
        # accepts hint keys found among them.
        assert 'declared = set((static_schema.get("properties") or {}).keys())' in src
        assert "key in declared" in src

    def test_the_old_unguarded_append_is_gone(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        assert "if isinstance(key, str) and key.strip() and key not in required_static:" not in src


class TestTheTriggerIsChecked:
    def test_readiness_inspects_the_configured_trigger(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        assert "configured_tool_trigger" in src
        assert "_missing_required_static" in src

    def test_a_missing_trigger_setting_is_reported_as_its_own_kind(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        assert '"type": "trigger_config"' in src

    def test_the_tool_config_check_fails_on_a_trigger_gap_too(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        assert 'm.get("type") in {"tool_config", "trigger_config"}' in src

    def test_an_uninspectable_trigger_does_not_take_readiness_down(self):
        src = inspect.getsource(evaluator.evaluate_agent_readiness)
        assert "readiness_trigger_config_check_failed" in src


class TestTheListenErrorNamesWhatIsMissing:
    def test_the_service_error_carries_the_field_names(self):
        from agent_service.triggers.service import TriggerServiceError

        err = TriggerServiceError("CONFIG_REQUIRED", "boom", fields=["board", "list"])
        assert err.fields == ["board", "list"]
        assert err.code == "CONFIG_REQUIRED"

    def test_it_defaults_to_naming_nothing(self):
        from agent_service.triggers.service import TriggerServiceError

        assert TriggerServiceError("X").fields == []

    def test_config_required_passes_the_missing_props_along(self):
        from agent_service.triggers.service import _deploy_source

        src = inspect.getsource(_deploy_source)
        assert "fields=missing" in src

    def test_connection_required_names_the_app(self):
        from agent_service.triggers.service import _deploy_source

        src = inspect.getsource(_deploy_source)
        assert "fields=[app_id] if app_id else []" in src

    def test_the_route_forwards_the_fields(self):
        from agent_service.routers import agents

        src = inspect.getsource(agents.start_trigger_listen)
        assert '"fields": exc.fields' in src


class TestTheTriggerPickerUsesTheSchemasAuthName:
    def test_it_reads_the_auth_prop_from_the_component(self):
        import inspect

        from agent_service.routers import integrations

        src = inspect.getsource(integrations.trigger_dynamic_options)
        # Guessing the auth prop from the app slug holds only while the two
        # agree; Slack's app is `slack_v2` and its prop is `slack`.
        assert "schema.auth_prop_name" in src

    def test_a_failed_configure_call_is_no_longer_silent(self):
        import inspect

        from agent_service.routers import integrations

        src = inspect.getsource(integrations.trigger_dynamic_options)
        assert "trigger_configure_failed" in src
        assert "except Exception:  # noqa: BLE001\n        rows = []" not in src
