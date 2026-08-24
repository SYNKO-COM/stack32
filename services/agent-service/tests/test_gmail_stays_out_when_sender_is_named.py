"""Naming your own email sender must keep Gmail out of the review card.

The capability planner had two doors for email. _email_tool_ids guarded the
first with names_its_own_email_provider; the "ambiguous email defaults to
Gmail" door did not, so "envoie-lui une relance par email via SendGrid" put a
Gmail card at the top of the tool review and the person had to refuse it by
hand — observed live on a fresh dunning agent.
"""

from agent_service.builder.capabilities import build_capability_plan


def _email_apps(prompt: str) -> set[str]:
    plan = build_capability_plan(prompt)
    return {
        (c.preferred_app or "").lower()
        for c in plan.capabilities
        if c.id == "email"
    }


def test_sendgrid_in_the_prompt_means_no_gmail():
    prompt = (
        "Surveille mes factures Stripe impayées. Pour chaque facture en retard, "
        "envoie-lui une relance polie par email via SendGrid avec le montant."
    )
    assert "gmail" not in _email_apps(prompt)


def test_every_named_sender_wins_over_the_default():
    for sender in ("Mailgun", "Postmark", "Brevo", "Resend"):
        prompt = f"Envoie automatiquement la facture par email via {sender}."
        assert "gmail" not in _email_apps(prompt), sender


def test_a_bare_email_automation_still_gets_an_email_capability():
    # No provider named: the capability stays and the default applies later —
    # this guard must only remove Gmail when a sender is named, never the
    # ability to send email at all.
    prompt = "Envoie un email de bienvenue à chaque nouveau client."
    plan = build_capability_plan(prompt)
    assert "email" in plan.capability_ids()


def test_a_named_sender_keeps_the_email_capability_too():
    prompt = "Envoie automatiquement la facture par email via SendGrid."
    plan = build_capability_plan(prompt)
    assert "email" in plan.capability_ids()


def test_outlook_still_wins_when_asked():
    prompt = "Envoie la relance par email depuis Outlook."
    apps = _email_apps(prompt)
    assert "gmail" not in apps


def test_answering_the_mailbox_form_with_any_sender_counts():
    # The clarification form only accepted Gmail or Outlook as an answer, so
    # "SendGrid" re-opened the same form on every turn of a live build.
    from agent_service.builder.capabilities import is_email_provider_slug

    for app in ("sendgrid", "SendGrid", "mailgun", "postmark", "gmail", "outlook"):
        assert is_email_provider_slug(app), app
    for app in ("stripe", "hubspot", "zendesk", ""):
        assert not is_email_provider_slug(app), app


def test_the_form_condition_reads_the_helper():
    import inspect

    from agent_service.builder import orchestrator

    src = inspect.getsource(
        orchestrator.BuilderOrchestrator._maybe_interrupt_for_provider_clarification
    )
    assert "is_email_provider_slug" in src
