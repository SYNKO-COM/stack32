"""Read Cloud Run metadata, fail closed before a Chrome preproduction deployment.

No secret values are read. Invoke with exports of BOTH preproduction services.
"""
import json
import sys
from pathlib import Path

ORIGIN = 'https://pre-prod-659874458xx.stack32.com'
DATABASE = 'https://fbqjuqnkemlofklrjeuo.supabase.co'
EXPECTED = {'stack32-agent-api-preprod', 'stack32-agent-worker-preprod'}

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
        if ref and not ref.startswith('stack32-preprod-'):
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
