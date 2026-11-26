"""After build:worker. Exercise real signed enrollment in a temporary database; no transport allowed."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest
class EnrollmentTests(unittest.TestCase):
 def test_image_fingerprint_matches_the_exact_operator_sources(self):
  import hashlib
  spec=__import__('importlib.util',fromlist=['util']).spec_from_file_location('batch_fingerprint',Path(__file__).parents[1]/'deploy/iwinv/sales-batch.py')
  batch=__import__('importlib.util',fromlist=['util']).module_from_spec(spec);spec.loader.exec_module(batch)
  digest=hashlib.sha256()
  for path in batch.sales_sources():digest.update(path.encode()+b'\0'+(batch.ROOT/path).read_bytes()+b'\0')
  self.assertEqual(json.loads((batch.ROOT/'dist/sales-build-id.json').read_text())['digest'],digest.hexdigest())

 def test_bootstrap_enroll_restart_and_tamper_refusal(self):
  root=Path(__file__).parents[1]
  with tempfile.TemporaryDirectory() as directory:
   folder=Path(directory);private=folder/'private';private.mkdir(mode=0o700)
   env=os.environ.copy();env.update(APP_MODE='local',EXTERNAL_EFFECTS='disabled',APP_ORIGIN='https://gumseo.kr',DATABASE_PATH=str(folder/'sales.sqlite'),DATA_KEY=secrets.token_hex(32),AUTH_SECRET=secrets.token_hex(32),ADMIN_PASSWORD=secrets.token_hex(24),ADMIN_TOTP_SECRET=secrets.token_hex(20),TOSS_LIVE_CLIENT_KEY='live_gck_syntheticfixture',TOSS_LIVE_SECRET_KEY='live_gsk_syntheticfixture',TOSS_LIVE_MERCHANT_ID='synthetic-mid',RESEND_API_KEY='re_syntheticfixture',RESEND_ACCOUNT_SCOPE='fixture',TRANSACTION_MAIL_SENDER='archive@example.com',TRANSACTION_MAIL_REPLY_TO='owner@example.com',AI_DAILY_USD_MICROS='5000000',AI_LIFETIME_USD_MICROS='30000000',AI_RESERVATION_USD_MICROS='500000',TOSS_LIVE_CUTOVER_FILE=str(private/'toss.json'),AI_CUTOVER_FILE=str(private/'ai.json'),MAIL_CUTOVER_FILE=str(private/'mail.json'))
   args=['node',str(root/'dist/sales-enroll.js')]
   def run(option,body=None):return subprocess.run(args+[option],cwd=root,env=env,input=body,text=True,capture_output=True)
   imported=run('--import-operator',json.dumps({'version':1,'liveOrders':0,'tables':{}}));self.assertEqual(imported.returncode,0,imported.stderr)
   enrolled=run('--enroll');self.assertEqual(enrolled.returncode,0,enrolled.stderr)
   first={p.name:p.read_bytes() for p in private.iterdir()}
   self.assertEqual(run('--enroll').returncode,0)
   self.assertEqual(run('--import-operator',json.dumps({'version':1,'liveOrders':0,'tables':{}})).returncode,0)
   self.assertEqual(first,{p.name:p.read_bytes() for p in private.iterdir()})
   self.assertEqual(run('--check').returncode,0)
   self.assertNotIn(env['TOSS_LIVE_SECRET_KEY'],enrolled.stdout+enrolled.stderr)
   env['TOSS_LIVE_SECRET_KEY']='live_gsk_differentfixture'
   self.assertNotEqual(run('--check').returncode,0)
