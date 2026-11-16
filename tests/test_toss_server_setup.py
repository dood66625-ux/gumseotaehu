import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('setup', Path(__file__).parents[1] / 'deploy/iwinv/setup-toss.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SetupTests(unittest.TestCase):
    def test_rejects_live_and_individual_keys_without_creating_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'test.env'
            for client, secret in [('live_gck_fixture', 'test_gsk_fixture'), ('test_gck_fixture', 'live_gsk_fixture'), ('test_ck_fixture', 'test_sk_fixture'), ('test_gck_fixture\nOPENAI_API_KEY=bad', 'test_gsk_fixture')]:
                with self.assertRaises(ValueError):
                    m.write_config(client, secret, target)
                self.assertFalse(target.exists())

    def test_private_isolated_config_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'test.env'
            m.write_config('test_gck_fixture', 'test_gsk_fixture', target)
            original = target.read_bytes()
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertIn(b'EXTERNAL_EFFECTS=disabled', original)
            self.assertIn(b'TOSS_TEST_MID=tq_gdood65qf7\n', original)
            self.assertNotIn(b'OPENAI_API_KEY', original)
            self.assertNotIn(b'RESEND_API_KEY', original)
            with self.assertRaises(FileExistsError):
                m.write_config('test_gck_fixture', 'test_gsk_fixture', target)
            self.assertEqual(target.read_bytes(), original)
