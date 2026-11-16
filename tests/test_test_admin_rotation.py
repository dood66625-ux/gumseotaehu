import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('rotation', Path(__file__).parents[1] / 'deploy/iwinv/rotate-test-admin.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class RotationTests(unittest.TestCase):
    def fixture(self, directory):
        target = Path(directory) / 'test.env'
        target.write_text('APP_MODE=local\nEXTERNAL_EFFECTS=disabled\nDATA_KEY=keep-data-key\nTOSS_TEST_SECRET_KEY=test_gsk_fixture\nTOSS_TEST_CLIENT_KEY=test_gck_fixture\nADMIN_PASSWORD=old-password\nADMIN_TOTP_SECRET=old-mfa\nAUTH_SECRET=old-session-key\n')
        target.chmod(0o600)
        return target

    def test_rotates_auth_only_and_preserves_key_material(self):
        with tempfile.TemporaryDirectory() as directory:
            target = self.fixture(directory)
            before = dict(row.split('=', 1) for row in target.read_text().splitlines())
            m.rotate(target)
            after = dict(row.split('=', 1) for row in target.read_text().splitlines())
            self.assertEqual({k for k in before if before[k] != after[k]}, {'ADMIN_PASSWORD', 'ADMIN_TOTP_SECRET', 'AUTH_SECRET'})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_live_config_not_touched(self):
        with tempfile.TemporaryDirectory() as directory:
            target = self.fixture(directory)
            target.write_text(target.read_text().replace('test_gsk_fixture', 'live_gsk_fixture'))
            original = target.read_bytes()
            with self.assertRaises(ValueError): m.rotate(target)
            self.assertEqual(target.read_bytes(), original)

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = self.fixture(directory)
            link = Path(directory) / 'link.env'; link.symlink_to(target)
            with self.assertRaises(OSError): m.rotate(link)

    def test_failed_replace_preserves_original_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            target = self.fixture(directory); original = target.read_bytes()
            with patch.object(m.os, 'replace', side_effect=OSError('simulated')):
                with self.assertRaises(OSError): m.rotate(target)
            self.assertEqual(target.read_bytes(), original)
            self.assertEqual(list(Path(directory).glob('.test-admin-*')), [])
