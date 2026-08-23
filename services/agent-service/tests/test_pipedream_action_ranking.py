"""Pipedream returns an app's catalog in its own order, not by relevance.

For "gmail" the API answers with signature, alias and label management first
and "Find Emails" twelfth — so a builder that keeps the first N actions
equipped an inbox-watching agent with everything except the ability to read
the inbox. Free-text queries fare worse: `q` filters on the app, so
"gmail find email" matches nothing at all.
"""

from __future__ import annotations

from agent_service.integrations.pipedream.client import rank_actions

# The real order returned by Pipedream for q=gmail.
GMAIL_CATALOG = [
    {"name": "Update Signature for Primary Email Address", "summary": "Update the signature."},
    {"name": "Update Signature for Email in Organization", "summary": "Update a signature."},
    {"name": "Send Email", "summary": "Send an email from your account."},
    {"name": "Modify Labels", "summary": "Add or remove labels on a message."},
    {"name": "Get Thread", "summary": "Retrieve a thread by id."},
    {"name": "List Signature Options", "summary": "List signature options."},
    {"name": "List Send As Aliases", "summary": "List send-as aliases."},
    {"name": "List Labels", "summary": "List the labels."},
    {"name": "List Send as a Delegate Options", "summary": "List delegates."},
    {"name": "Get Send As Alias", "summary": "Get one alias."},
    {"name": "Get Current User", "summary": "Get the current profile."},
    {"name": "Find Emails", "summary": "Search for messages matching a query."},
]


def _names(rows):
    return [r["name"] for r in rows]


def test_find_emails_wins_a_search_query():
    ranked = rank_actions(GMAIL_CATALOG, "gmail find emails")
    assert ranked[0]["name"] == "Find Emails"


def test_send_email_wins_a_send_query():
    ranked = rank_actions(GMAIL_CATALOG, "gmail send an email")
    assert ranked[0]["name"] == "Send Email"


def test_bare_app_query_keeps_pipedream_order():
    """One token carries no signal; reordering on it would be noise."""
    assert _names(rank_actions(GMAIL_CATALOG, "gmail")) == _names(GMAIL_CATALOG)


def test_ranking_is_stable_for_ties():
    ranked = rank_actions(GMAIL_CATALOG, "gmail zzz")
    assert _names(ranked) == _names(GMAIL_CATALOG)


def test_stopwords_do_not_decide_the_winner():
    ranked = rank_actions(GMAIL_CATALOG, "search for the emails in my inbox")
    assert ranked[0]["name"] == "Find Emails"


def test_name_outweighs_description():
    rows = [
        {"name": "Unrelated Action", "summary": "mentions labels twice: labels labels"},
        {"name": "Modify Labels", "summary": "does something"},
    ]
    assert rank_actions(rows, "modify labels")[0]["name"] == "Modify Labels"


def test_no_rows_is_not_an_error():
    assert rank_actions([], "gmail find emails") == []
