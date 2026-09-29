"""Read Cloud Run metadata, fail closed before a Chrome preproduction deployment.

No secret values are read. Invoke with exports of BOTH preproduction services.
"""
import json
import sys
from pathlib import Path

ORIGIN = 'https://pre-prod-659874458xx.stack32.com'
DATABASE = 'https://fbqjuqnkemlofklrjeuo.supabase.co'
EXPECTED = {'stack32-agent-api-preprod', 'stack32-agent-worker-preprod'}
# Shared provider keys explicitly authorized by the project owner on 2026-09-29.
# This exception never covers database, user auth, encryption or internal tokens.
SHARED_PROVIDER_REFS = {
    'OPENAI_API_KEY': 'stack32-production-openai-api-key',
    'XAI_API_KEY': 'stack32-production-xai-api-key',
    'ANTHROPIC_API_KEY': 'stack32-production-anthropic-api-key',
    'E2B_API_KEY': 'stack32-production-e2b-api-key',
    'WEB_SEARCH_API_KEY': 'stack32-production-web-search-api-key',
    'PIPEDREAM_CLIENT_ID': 'stack32-production-pipedream-client-id',
    'PIPEDREAM_CLIENT_SECRET': 'stack32-production-pipedream-client-secret',
    'PIPEDREAM_PROJECT_ID': 'stack32-production-pipedream-project-id',
    'SENTRY_DSN': 'stack32-production-sentry-dsn',
}

def inspect(config):
    name = config.get('metadata', {}).get('name')
    errors = []
    if name not in EXPECTED:
        return name, ['unexpected Cloud Run target']
    env = {e['name']: e for e in config['spec']['template']['spec']['containers'][0].get('env', [])}
    for key, value in {'APP_ORIGIN':ORIGIN, 'SUPABASE_URL':DATABASE, 'SUPABASE_JWT_ISSUER':DATABASE+'/auth/v1', 'SUPABASE_JWKS_URL':DATABASE+'/auth/v1/.well-known/jwks.json', 'ALLOW_UNVERIFIED_JWT':'false'}.items():
        if env.get(key, {}).get('value') != value:
            errors.append(f'{key}: missing or unexpected preproduction configuration')
    for key, entry in env.items():
        ref = entry.get('valueFrom', {}).get('secretKeyRef', {}).get('name')
        if ref and not ref.startswith('stack32-preprod-') and SHARED_PROVIDER_REFS.get(key) != ref:
            errors.append(f'{key}: secret {ref} is not dedicated to preproduction')
        if not ref and any(part in key for part in ('API_KEY','CLIENT_SECRET','SERVICE_ROLE_KEY','DATABASE_URL','ENCRYPTION_KEY','INTERNAL_SERVICE_TOKEN')):
            errors.append(f'{key}: use an identifiable preproduction Secret Manager reference')
    return name, errors

if __name__ == '__main__':
    names = set()
    failures = []
    for argument in sys.argv[1:]:
        name, errors = inspect(json.loads(Path(argument).read_text()))
        names.add(name)
        failures.extend(f'{name}: {error}' for error in errors)
    if names != EXPECTED:
        failures.append('Both preproduction API and worker exports are required')
    if failures:
        print('\n'.join(failures))
        raise SystemExit(1)
    print('Preproduction service identities and secret references verified. No secret values read.')
