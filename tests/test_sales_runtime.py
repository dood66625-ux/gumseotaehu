import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('runtime',Path(__file__).parents[1]/'deploy/iwinv/prepare-sales-runtime.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
class RuntimeTests(unittest.TestCase):
 def values(self):
  local={'DATA_KEY':'a'*64,'AUTH_SECRET':'b'*64,'ADMIN_PASSWORD':'c'*48,'ADMIN_TOTP_SECRET':'ab'*20}
  credentials={'TOSS_LIVE_CLIENT_KEY':'live_gck_fixture123','TOSS_LIVE_SECRET_KEY':'live_gsk_fixture123','TOSS_LIVE_MERCHANT_ID':'fixture-mid','RESEND_API_KEY':'re_fixture_credentials','TRANSACTION_MAIL_SENDER':'archive@mail.example.com','TRANSACTION_MAIL_REPLY_TO':'owner@example.com','RESEND_ACCOUNT_SCOPE':'gumseo-main'}
  return local,credentials,{'OPENAI_API_KEY':'sk-private_existing_fixture_1234567890'}
 def test_reuses_existing_keys_with_budget_and_keeps_effects_disabled(self):
  local,credentials,ai=self.values();values=runtime.build_runtime(local,credentials,ai)
  self.assertEqual(values['OPENAI_API_KEY'],ai['OPENAI_API_KEY']);self.assertEqual(values['DATA_KEY'],local['DATA_KEY'])
  self.assertEqual(values['AI_REPORT_PROFILE'],'rich-ko-v1')
  self.assertEqual(values['AI_RESERVATION_USD_MICROS'],'500000')
  self.assertEqual(values['AI_DAILY_USD_MICROS'],'5000000');self.assertEqual(values['AI_LIFETIME_USD_MICROS'],'30000000')
  for mode in ['TOSS_PAYMENT_MODE','MAIL_WORKER_MODE','AI_WORKER_MODE']:self.assertEqual(values[mode],'disabled')
  self.assertNotIn('LIVE_PAYMENTS_APPROVAL',values)
  with tempfile.TemporaryDirectory() as directory:
   target=Path(directory)/'runtime.env';runtime.write_new(target,values)
   self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o600)
   before=target.read_bytes()
   with self.assertRaises(FileExistsError):runtime.write_new(target,values)
   self.assertEqual(target.read_bytes(),before)
 def test_rejects_test_payment_keys_and_missing_existing_ai_key(self):
  local,credentials,ai=self.values();credentials['TOSS_LIVE_SECRET_KEY']='test_gsk_fixture123'
  with self.assertRaises(ValueError):runtime.build_runtime(local,credentials,ai)
  local,credentials,ai=self.values()
  with self.assertRaises(ValueError):runtime.build_runtime(local,credentials,{})
