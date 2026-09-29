"""Configuration gate tests: fabricated metadata only, never secret values."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("chrome_guard", Path(__file__).parents[1] / "check-chrome-preprod.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class GuardTests(unittest.TestCase):
    def config(self):
        values = {
            'APP_ORIGIN':guard.ORIGIN, 'SUPABASE_URL':guard.DATABASE,
            'SUPABASE_JWT_ISSUER':guard.DATABASE+'/auth/v1',
            'SUPABASE_JWKS_URL':guard.DATABASE+'/auth/v1/.well-known/jwks.json',
            'ALLOW_UNVERIFIED_JWT':'false',
        }
        return {'metadata':{'name':'stack32-agent-api-preprod'}, 'spec':{'template':{'spec':{'containers':[{'env':[{'name':k,'value':v} for k,v in values.items()]}]}}}}

    def test_isolated_metadata_passes(self):
        self.assertEqual(guard.inspect(self.config())[1], [])

    def test_explicitly_authorized_provider_ref_is_allowed(self):
        config = self.config()
        config['spec']['template']['spec']['containers'][0]['env'].append({'name':'OPENAI_API_KEY','valueFrom':{'secretKeyRef':{'name':'stack32-production-openai-api-key'}}})
        self.assertEqual(guard.inspect(config)[1], [])

    def test_shared_database_ref_is_always_refused(self):
        config = self.config()
        config['spec']['template']['spec']['containers'][0]['env'].append({'name':'DATABASE_URL','valueFrom':{'secretKeyRef':{'name':'stack32-production-supabase-database-url'}}})
        self.assertIn('not dedicated', guard.inspect(config)[1][0])

    def test_unknown_target_is_refused(self):
        config = self.config()
        config['metadata']['name'] = 'stack32-agent-api'
        self.assertTrue(guard.inspect(config)[1])

    def test_wrong_database_is_refused(self):
        config = self.config()
        config['spec']['template']['spec']['containers'][0]['env'][1]['value'] = 'https://production.example'
        self.assertTrue(guard.inspect(config)[1])

if __name__ == '__main__':
    unittest.main()
