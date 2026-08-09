"""Least-privilege Google scopes mapping."""

from agent_service.connections.manager import scopes_for_tools


def test_gmail_list_readonly():
    scopes = scopes_for_tools(["gmail_list", "gmail_read"])
    assert "https://www.googleapis.com/auth/gmail.readonly" in scopes
    assert "https://www.googleapis.com/auth/gmail.send" not in scopes
    assert "https://www.googleapis.com/auth/gmail.compose" not in scopes


def test_gmail_draft_compose():
    scopes = scopes_for_tools(["gmail_create_draft"])
    assert "https://www.googleapis.com/auth/gmail.compose" in scopes
    assert "https://www.googleapis.com/auth/gmail.send" not in scopes


def test_gmail_send():
    scopes = scopes_for_tools(["gmail_send_message"])
    assert "https://www.googleapis.com/auth/gmail.send" in scopes


def test_docs_scopes():
    scopes = scopes_for_tools(["google_docs_create", "google_docs_append"])
    assert "https://www.googleapis.com/auth/documents" in scopes
    assert "https://www.googleapis.com/auth/drive.file" in scopes
