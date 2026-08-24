"""The structure page's readiness call must persist what it just evaluated.

Relance Factures reached ready on every check, yet its published page kept
asking to link HubSpot and Zendesk: the installation row still said
`setup_required` from the moment it was created, and the agents readiness
route — the one the structure page calls — evaluated without ever writing
the result back. The installations route already did.
"""

import inspect

from agent_service.routers import agents, installations


def test_the_agents_route_writes_the_evaluated_status():
    src = inspect.getsource(agents)
    assert '"needs_setup": "setup_required"' in src
    assert "update_status(" in src


def test_both_routes_share_the_same_mapping():
    for module in (agents, installations):
        src = inspect.getsource(module)
        assert '"ready": "ready"' in src
        assert '"needs_attention": "needs_attention"' in src


def test_it_only_writes_on_change():
    src = inspect.getsource(agents)
    assert 'install.get("status") != mapped' in src
