"""A remote-options widget is not, by itself, a setting.

Stripe's create-subscription marks `customer` required with a picker; which
customer is the whole point of a call. Zendesk's reply-to-side-conversation
does the same with `ticketId`. Under the old default — picker means static —
these landed in the drawer and in the readiness gate, and a live agent sat
behind "à configurer" over choices nobody can pin in advance.

Only a prop naming a container (board, base, inbox) or an identity (fromEmail)
is pinned once. Everything else is the agent's per-call business, whatever
widget Pipedream renders for it.
"""

from agent_service.integrations.pipedream.schema import normalize_configurable_props


def kinds(props, app="demo", action="demo-action"):
    schema = normalize_configurable_props(
        {"key": action, "app": {"name_slug": app}, "configurable_props": props},
        action_id=action,
    )
    return {p.name: p.kind for p in schema.props}


APP = {"name": "demo", "type": "app", "app": "demo"}


class TestPerCallChoicesStayWithTheAgent:
    def test_which_customer_to_bill_is_never_pinned(self):
        k = kinds(
            [
                APP,
                {"name": "customer", "type": "string", "remoteOptions": True, "optional": False},
                {"name": "items", "type": "string[]", "remoteOptions": True, "optional": False},
            ],
            app="stripe",
            action="stripe-create-subscription",
        )
        assert k["customer"] == "runtime"
        assert k["items"] == "runtime"

    def test_which_ticket_to_answer_is_never_pinned(self):
        k = kinds(
            [APP, {"name": "ticketId", "type": "string", "remoteOptions": True, "optional": False}],
            app="zendesk",
            action="zendesk-reply-to-side-conversation",
        )
        assert k["ticketId"] == "runtime"

    def test_which_thread_to_continue_is_never_pinned(self):
        k = kinds(
            [APP, {"name": "threadId", "type": "string", "remoteOptions": True, "optional": False}],
            app="hubspot",
            action="hubspot-send-message",
        )
        assert k["threadId"] == "runtime"


class TestContainersAndIdentitiesStayPinned:
    def test_the_workspace_containers_survive_the_flip(self):
        k = kinds(
            [
                APP,
                {"name": "board", "type": "string", "remoteOptions": True, "optional": False},
                {"name": "baseId", "type": "string", "remoteOptions": True, "optional": False},
                {"name": "inboxId", "type": "string", "remoteOptions": True, "optional": False},
            ]
        )
        assert set(k.values()) - {"connection"} == {"static"}

    def test_a_sender_identity_is_configuration(self):
        # SendGrid's fromEmail is a signature, not a per-call whim.
        k = kinds(
            [APP, {"name": "fromEmail", "type": "string", "optional": False}],
            app="sendgrid",
            action="sendgrid-send-email-single-recipient",
        )
        assert k["fromEmail"] == "static"

    def test_the_id_dressing_does_not_hide_a_container(self):
        # Trello writes idList, others write listId or workspaceId — same word.
        k = kinds(
            [
                APP,
                {"name": "idList", "type": "string", "remoteOptions": True, "optional": False},
                {"name": "workspaceId", "type": "string", "remoteOptions": True, "optional": False},
            ]
        )
        assert k["idList"] == "static"
        assert k["workspaceId"] == "static"

    def test_an_account_resource_type_is_still_the_users_pick(self):
        k = kinds([APP, {"name": "channels", "type": "$.discord.channel[]"}], app="discord")
        assert k["channels"] == "static"
