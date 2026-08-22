# Sandbox egress — what is and is not guaranteed

## Current state

`SandboxConfig.allow_network=False` rejects a denylist of eleven binaries
(`curl`, `wget`, `nc`, `ncat`, `netcat`, `ssh`, `scp`, `ftp`, `telnet`, `dig`,
`nslookup`) before a command is dispatched to E2B.

**This is not network isolation.** An E2B microVM has internet access, and the
coding agent requires `python` to run pytest and ruff. Any generated project can
therefore reach the network:

```python
python -c "import urllib.request; urllib.request.urlopen('https://example.com')"
```

`pip`, `git` and every HTTP-capable library are equally unaffected. The denylist
stops casual egress and makes deliberate egress conspicuous in the run
transcript. It is a speed bump, not a containment boundary.

## Why the blast radius is currently contained

No platform secret ever enters a workspace. `E2BSandbox.create_workspace` passes
only `template`, `api_key` and `timeout` to the SDK — never `SandboxConfig.env`,
and never an application secret. A workspace holds the user's own generated
project and nothing else, so egress cannot leak credentials or another tenant's
data.

`tests/test_sandbox_no_secrets.py` enforces this invariant. **Do not relax it.**
The moment a secret is injected into a sandbox, the weak egress control turns
into a real exfiltration path and must be replaced first.

Residual risk today:

- a generated project can call arbitrary external services during its own tests
- a sandbox can be used as an egress proxy (abuse / reputation on E2B IPs)
- a prompt-injected build could exfiltrate the user's own generated code

## Fixing it properly

Real egress control is an E2B-side capability, not something the service can
impose from the caller. Options, in preference order:

1. **Custom E2B template with egress rules** — allow only PyPI and the package
   mirrors the build genuinely needs, deny the rest by default.
2. **E2B plan with network policy support** — check whether the current plan
   exposes per-sandbox network configuration, and pass it at `create()`.
3. **Proxy-only egress** — force traffic through an allowlisting proxy by
   setting `HTTP_PROXY`/`HTTPS_PROXY` in the sandbox and blocking direct routes
   in the template.

Until one of these lands, keep the denylist (it is cheap and makes intent
visible), keep the no-secrets invariant, and treat sandbox egress as untrusted
in threat models.

## Verifying a change

```bash
cd services/agent-service && .venv/bin/python -m pytest tests/test_sandbox_no_secrets.py -q
```
