import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
spec=importlib.util.spec_from_file_location('operator_provision',Path(__file__).parents[1]/'deploy/iwinv/provision-operator.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class OperatorProvision(unittest.TestCase):
 def fixture(self, root):
  env=Path(root)/'app.env';env.write_text('# private config\nAPP_MODE=local\nEXTERNAL_EFFECTS=disabled\nAPP_ORIGIN=https://operator.example.invalid\nDATA_KEY=preserved-data\nAUTH_SECRET=preserved-customer-signing\nADMIN_PASSWORD=old-password\nADMIN_TOTP_SECRET=old-totp\nTOSS_PAYMENT_MODE=disabled\nOPENAI_API_KEY=preserved-provider\nLIVE_REFUNDS_APPROVAL=\n');env.chmod(0o600)
  return env,Path(root)/'enrollment.json'
 def test_only_admin_credentials_change_and_provision_file_matches_hex_seed(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_text();m.provision(env,output)
   old=dict(row.split('=',1) for row in before.splitlines() if '=' in row)
   new=dict(row.split('=',1) for row in env.read_text().splitlines() if '=' in row)
   self.assertEqual({k for k in old if old[k]!=new[k]}, {'ADMIN_PASSWORD','ADMIN_TOTP_SECRET'})
   bundle=json.loads(output.read_text());self.assertEqual(bundle['password'],new['ADMIN_PASSWORD'])
   self.assertEqual(base64.b32decode(bundle['totpSecretBase32']).hex(),new['ADMIN_TOTP_SECRET'])
   self.assertTrue(bundle['authenticatorUri'].startswith('otpauth://totp/'));self.assertNotIn('DATA_KEY',bundle)
   self.assertEqual(output.stat().st_mode & 0o777,0o600);self.assertEqual(env.stat().st_mode & 0o777,0o600)
 def test_new_secrets_cannot_be_written_inside_the_checkout(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_bytes()
   checkout=Path(m.__file__).resolve().parents[2]
   with self.assertRaisesRegex(ValueError,'OUTSIDE_WORKTREE'):m.provision(env,checkout/'var'/'not-created-operator.json')
   self.assertEqual(env.read_bytes(),before)
 def test_existing_bundle_is_not_overwritten_and_config_remains_unchanged(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_bytes();output.write_text('previous')
   with self.assertRaises(FileExistsError):m.provision(env,output)
   self.assertEqual(env.read_bytes(),before);self.assertEqual(output.read_text(),'previous')
 def test_failed_atomic_replace_keeps_old_configuration_and_removes_unused_bundle(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_bytes()
   with patch.object(m.os,'replace',side_effect=OSError('fixture')):
    with self.assertRaises(OSError):m.provision(env,output)
   self.assertEqual(env.read_bytes(),before);self.assertFalse(output.exists());self.assertEqual(list(Path(root).glob('.operator-*')),[])
 def test_uncertain_directory_commit_retains_the_private_enrollment_for_recovery(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_bytes()
   with patch.object(m,'sync_dir',side_effect=[None,OSError('fixture')]):
    with self.assertRaisesRegex(ValueError,'COMMIT_UNCERTAIN'):m.provision(env,output)
   self.assertNotEqual(env.read_bytes(),before);self.assertTrue(output.exists())
 def test_http_public_modes_and_symlinks_are_refused_before_changes(self):
  with tempfile.TemporaryDirectory() as root:
   env,output=self.fixture(root);before=env.read_text();env.chmod(0o644)
   with self.assertRaises(ValueError):m.provision(env,output)
   env.chmod(0o600);env.write_text(before.replace('https://','http://'))
   with self.assertRaises(ValueError):m.provision(env,output)
   env.write_text(before);link=Path(root)/'link';link.symlink_to(env)
   with self.assertRaises(OSError):m.provision(link,output)
   self.assertEqual(env.read_text(),before);self.assertFalse(output.exists())
 def test_active_update_or_main_container_blocks_offline_enrollment(self):
  with patch.object(m.subprocess,'run',return_value=Mock(returncode=0,stdout=b'')):
   with self.assertRaisesRegex(ValueError,'STOP_AUTOMATIC'):m.assert_offline()
  with patch.object(m.subprocess,'run',side_effect=[Mock(returncode=3),Mock(returncode=3),Mock(returncode=3),Mock(stdout=b'running-id')]):
   with self.assertRaisesRegex(ValueError,'STOP_MAIN_WEB'):m.assert_offline()
  with patch.object(m.subprocess,'run',side_effect=[Mock(returncode=3),Mock(returncode=3),Mock(returncode=3),Mock(stdout=b'')]):m.assert_offline()
if __name__=='__main__':unittest.main()
