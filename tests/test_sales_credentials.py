import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('sales',Path(__file__).parents[1]/'deploy/iwinv/prepare-sales-credentials.py')
sales=importlib.util.module_from_spec(spec);spec.loader.exec_module(sales)
class CredentialsTests(unittest.TestCase):
 def test_only_stages_validated_live_credentials_and_never_ai_or_activation(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'sales.env'
   values={'TOSS_LIVE_CLIENT_KEY':'live_gck_fixture123','TOSS_LIVE_SECRET_KEY':'live_gsk_fixture123','TOSS_LIVE_MERCHANT_ID':'fixture-mid'}
   sales.write_private(path,values)
   self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
   self.assertEqual(sales.read_existing(path),values)
   sales.write_private(path,values)
   before=path.read_bytes()
   with self.assertRaises(ValueError):sales.write_private(path,{'TOSS_LIVE_SECRET_KEY':'test_gsk_fixture123'})
   with self.assertRaises(ValueError):sales.write_private(path,{'OPENAI_API_KEY':'must-not-copy'})
   self.assertEqual(path.read_bytes(),before)
   self.assertNotIn('TOSS_PAYMENT_MODE=',path.read_text())
   link=Path(directory)/'link.env';link.symlink_to(path)
   with self.assertRaises(OSError):sales.read_existing(link)
