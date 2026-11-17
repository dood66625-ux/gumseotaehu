"""Run after build:worker. Native HTTP/DB integration with provider fetch fully mocked."""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import unittest
import urllib.request
import urllib.error

class MerchantReviewTests(unittest.TestCase):
    def test_visitor_isolation_approval_report_and_restart(self):
        root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            for name in ('scripts','assets','db'):
                (temporary/name).symlink_to(root/name, target_is_directory=True)
            bootstrap = temporary/'provider.mjs'
            bootstrap.write_text("""const records=new Map(); globalThis.fetch=async(url,options)=>{
              if(!String(url).startsWith('https://api.tosspayments.com/v1/payments/'))throw Error('UNEXPECTED_NETWORK');
              if(options.method==='POST'&&String(url).endsWith('/confirm')){
                const b=JSON.parse(options.body);const p={paymentKey:b.paymentKey,orderId:b.orderId,mId:'tq_gdood65qf7',currency:'KRW',type:'NORMAL',totalAmount:b.amount,balanceAmount:b.amount,status:'DONE',approvedAt:new Date().toISOString(),cancels:null};records.set(b.paymentKey,p);return new Response(JSON.stringify(p));
              }
              const p=records.get(decodeURIComponent(String(url).split('/').pop()));return new Response(JSON.stringify(p||{}),{status:p?200:404});
            };""")
            env = os.environ.copy()
            for name in ('OPENAI_API_KEY','RESEND_API_KEY'): env.pop(name,None)
            env.update(APP_MODE='local',EXTERNAL_EFFECTS='disabled',MERCHANT_REVIEW_ORIGIN='http://127.0.0.1:3212',DATA_KEY=secrets.token_hex(32),AUTH_SECRET=secrets.token_hex(32),ADMIN_PASSWORD=secrets.token_hex(24),ADMIN_TOTP_SECRET=secrets.token_hex(20),TOSS_TEST_CLIENT_KEY='test_gck_fixture',TOSS_TEST_SECRET_KEY='test_gsk_fixture',TOSS_TEST_MID='tq_gdood65qf7')
            args=['node','--import',str(bootstrap),str(root/'dist/merchant-review.js'),'--test-network']
            def start():
                child=subprocess.Popen(args,cwd=temporary,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                for _ in range(60):
                    if child.poll() is not None: self.fail('Merchant review startup failed')
                    try:
                        urllib.request.urlopen('http://127.0.0.1:3212/health',timeout=1).close();return child
                    except OSError:time.sleep(.1)
                self.fail('Merchant review startup timeout')
            def stop(child):
                child.terminate()
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired:child.kill();child.wait()
            def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            first,second=client(),client(); child=start()
            try:
                for visitor in (first,second):
                    self.assertIn('https://gumseo.kr/refund.html',visitor.open('http://127.0.0.1:3212/').read().decode())
                a=json.load(first.open('http://127.0.0.1:3212/state')); b=json.load(second.open('http://127.0.0.1:3212/state'))
                self.assertNotEqual(a['order']['id'],b['order']['id'])
                with self.assertRaises(urllib.error.HTTPError) as blocked:
                    first.open(urllib.request.Request('http://127.0.0.1:3212/confirm',data=b'{}',headers={'Origin':'https://evil.example','Content-Type':'application/json'}))
                self.assertEqual(blocked.exception.code,403)
                payload=json.dumps({'orderId':a['order']['id'],'paymentKey':'test-fixture-bound-key','amount':22000}).encode()
                request=urllib.request.Request('http://127.0.0.1:3212/confirm',data=payload,headers={'Origin':'http://127.0.0.1:3212','Content-Type':'application/json'})
                self.assertEqual(json.load(first.open(request))['state'],'verified')
                for _ in range(40):
                    state=json.load(first.open('http://127.0.0.1:3212/state'))
                    if state['order']['fulfillment']=='ready':break
                    time.sleep(.1)
                self.assertEqual(state['order']['payment'],'paid')
                self.assertEqual(state['order']['fulfillment'],'ready')
                self.assertTrue(first.open('http://127.0.0.1:3212/pdf').read().startswith(b'%PDF'))
                with self.assertRaises(urllib.error.HTTPError) as other_pdf:second.open('http://127.0.0.1:3212/pdf')
                self.assertEqual(other_pdf.exception.code,403)
                with self.assertRaises(urllib.error.HTTPError) as admin:first.open('http://127.0.0.1:3212/admin')
                self.assertEqual(admin.exception.code,404)
                stop(child);child=start()
                after=json.load(first.open('http://127.0.0.1:3212/state'))
                self.assertEqual(after['order']['id'],a['order']['id'])
                self.assertEqual(after['order']['payment'],'paid')
            finally:stop(child)

if __name__=='__main__':unittest.main()
