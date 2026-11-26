import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('batch',Path(__file__).parents[1]/'deploy/iwinv/sales-batch.py')
batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)
class BatchTests(unittest.TestCase):
 def test_permission_repair_only_operates_on_regular_single_link_known_owner_files(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'private.env';path.write_text('PRIVATE_SECRET=not-printed\n');path.chmod(0o640)
   with patch.object(batch.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.getuid())),patch.object(batch.os,'fchown'):
    batch.repair(path)
    self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
    self.assertEqual(path.read_text(),'PRIVATE_SECRET=not-printed\n')
    link=Path(directory)/'link.env';link.symlink_to(path)
    with self.assertRaises(OSError):batch.repair(link)
 def test_activation_retains_existing_credentials_and_uses_exact_scoped_flags(self):
  text='OPENAI_API_KEY=private-not-printed\nAI_WORKER_MODE=disabled\nTOSS_PAYMENT_MODE=disabled\nMAIL_WORKER_MODE=disabled\n'
  data=batch.activate_env(text).decode()
  self.assertIn('OPENAI_API_KEY=private-not-printed\n',data)
  for field in ['AI_WORKER_MODE=openai','TOSS_PAYMENT_MODE=live','MAIL_WORKER_MODE=resend','SALES_MODE=live']:self.assertIn(field+'\n',data)
 def test_health_http_failure_raises_instead_of_treating_a_404_as_success(self):
  with patch.object(batch.urllib.request,'urlopen',side_effect=batch.urllib.error.HTTPError('https://example.com/start',404,'',None,None)):
   with self.assertRaises(ValueError):batch.check_http('https://example.com/start')

class BatchFlowTests(unittest.TestCase):
 def flow(self,fail_public=False):
  import hashlib
  import json
  from contextlib import ExitStack
  with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
   base=Path(directory);state=base/'state';state.mkdir(mode=0o700);env=base/'runtime.env';caddy=base/'Caddyfile';caddy.write_bytes(b'original proxy')
   compose=base/'compose.yml';lock=base/'lock';calls=[]
   sources=batch.sales_sources()
   digest=hashlib.sha256()
   for path in sources:digest.update(path.encode()+b'\0'+(batch.ROOT/path).read_bytes()+b'\0')
   expected={'TOSS_PAYMENT_MODE':'disabled','AI_WORKER_MODE':'disabled','MAIL_WORKER_MODE':'disabled','OPENAI_API_KEY':'private-fixture-not-logged'}
   def write_new(path,values):path.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
   module=SimpleNamespace(LOCAL=base/'a',CREDENTIALS=base/'b',AI=base/'c',read_private=lambda p:expected.copy(),build_runtime=lambda *a:expected.copy(),write_new=write_new)
   def run(args,timeout=180,data=None):
    calls.append((args,data))
    if any('sales-build-id.json' in str(a) for a in args):return digest.hexdigest().encode()
    if 'gumseo-local-web-1' in args:return b'{"version":1,"liveOrders":0,"tables":{}}'
    return b''
   def http(url,status=200):
    if fail_public and url.startswith('https:'):raise ValueError('SALES_HTTP_CHECK_FAILED')
   for name,value in [('STATE',state),('ENV',env),('CADDY',caddy),('COMPOSE',compose),('LOCK',lock),('SOURCES',[])]:stack.enter_context(patch.object(batch,name,value))
   stack.enter_context(patch.object(batch,'require_owner'))
   stack.enter_context(patch.object(batch,'runtime_module',return_value=module))
   stack.enter_context(patch.object(batch,'run',side_effect=run))
   stack.enter_context(patch.object(batch,'health'))
   stack.enter_context(patch.object(batch,'check_home'))
   stack.enter_context(patch.object(batch,'check_http',side_effect=http))
   stack.enter_context(patch.object(batch.time,'sleep'))
   stack.enter_context(patch.object(batch.sys,'argv',['batch','--activate']))
   if fail_public:
    with self.assertRaises(ValueError):batch.main()
    self.assertEqual(caddy.read_bytes(),b'original proxy')
    self.assertIn('AI_WORKER_MODE=disabled',env.read_text())
    self.assertFalse((state/'active.json').exists())
    self.assertTrue(any('stop' in args for args,data in calls))
   else:
    batch.main();self.assertTrue((state/'active.json').exists())
    self.assertIn('AI_WORKER_MODE=openai',env.read_text())
    self.assertIn('127.0.0.1:3110',caddy.read_text())
    self.assertTrue(any('--import-operator' in args for args,data in calls))
    self.assertTrue(any('--enroll' in args for args,data in calls))
    self.assertFalse(any('toss-sandbox' in str(args) for args,data in calls))
 def test_success_switches_only_after_offline_enrollment_and_health(self):self.flow()
 def test_public_failure_restores_proxy_and_disables_the_new_worker(self):self.flow(True)
