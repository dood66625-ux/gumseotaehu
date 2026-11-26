#!/usr/bin/env python3
"""One owner command: fix known env permissions, stage, enroll, verify, then switch the proxy.
No scripted charge, refund, AI generation, or mail is sent. Customer-triggered effects are enabled at cutover.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=Path('/usr/local/lib/gumseo')
ENV=Path('/etc/gumseo/sales/runtime.env')
COMPOSE=DIRECTORY/'compose.sales.yml'
CADDY=DIRECTORY/'Caddyfile.merchant-review'
REVIEW=['docker','compose','-f',str(DIRECTORY/'compose.merchant-review.yml')]
SALES=['docker','compose','-f',str(COMPOSE)]
STATE=Path('/var/lib/gumseo-sales-control')
LOCK=Path('/var/lib/gumseo-automation/lock')
SOURCES=[Path('/etc/gumseo/test.env'),Path('/etc/gumseo/private-reader.env'),Path('/etc/gumseo/sales/credentials.env')]

def require_owner():
 if os.geteuid()!=0:raise ValueError('ROOT_ACTIVATE_ARGUMENT_REQUIRED')

def runtime_module():
 spec=importlib.util.spec_from_file_location('sales_runtime',ROOT/'deploy/iwinv/prepare-sales-runtime.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 return module

def run(args,timeout=180,data=None):
 try:result=subprocess.run(args,input=data,capture_output=True,timeout=timeout)
 except subprocess.TimeoutExpired:raise ValueError('SALES_COMMAND_TIMEOUT') from None
 if result.returncode:
  for line in result.stderr.decode(errors='replace').splitlines():
   code=line.split(';',1)[0].strip()
   if re.fullmatch(r'(?:SALES|TOSS|AI|MAIL|CONFIG|RESEND|EXTERNAL)_[A-Z_0-9]{2,90}',code):raise ValueError(code)
  raise ValueError('SALES_COMMAND_FAILED')
 return result.stdout

def repair(path):
 # Explicit owner action over fixed, non-symlink application paths; no recursive chmod.
 print('CONFIG_PERMISSIONS_CHECK '+path.name,flush=True)
 allowed={0}
 try:allowed.add(pwd.getpwnam('gumseo').pw_uid)
 except KeyError:pass
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  info=os.fstat(fd)
  if not stat.S_ISREG(info.st_mode) or info.st_uid not in allowed or info.st_nlink!=1 or info.st_size>65536:raise ValueError('UNSAFE_SOURCE_CONFIG')
  os.fchmod(fd,0o600);os.fchown(fd,0,0)
 finally:os.close(fd)
 print('CONFIG_PERMISSIONS_READY '+path.name,flush=True)

def write(path,data,mode=0o600):
 fd,temp=tempfile.mkstemp(prefix='.sales-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
  os.chmod(temp,mode);os.replace(temp,path)
 finally:
  if os.path.exists(temp):os.unlink(temp)

def activate_env(text):
 modes={'TOSS_PAYMENT_MODE':'live','AI_WORKER_MODE':'openai','MAIL_WORKER_MODE':'resend','LIVE_PAYMENTS_APPROVAL':'live-payments-approved','CUSTOMER_AI_APPROVAL':'customer-data-approved','CUSTOMER_MAIL_APPROVAL':'customer-mail-approved','LIVE_REFUNDS_APPROVAL':'live-refunds-approved','SALES_MODE':'live'}
 values=dict(line.split('=',1) for line in text.splitlines() if line and not line.startswith('#'))
 values.update(modes)
 return ''.join(k+'='+v+'\n' for k,v in values.items()).encode()

def health():
 for _ in range(45):
  try:
   ids=[run(SALES+['ps','-q',s]).decode().strip() for s in ('web','worker')]
   if all(ids) and all(run(['docker','inspect','--format','{{.State.Health.Status}}',i]).strip()==b'healthy' for i in ids):return
  except ValueError:pass
  time.sleep(2)
 raise ValueError('SALES_HEALTH_NOT_READY')

def check_http(url,status=200):
 if url.startswith('https://gumseo.kr/'):
  code=run(['curl','--silent','--show-error','--max-time','10','--resolve','gumseo.kr:443:127.0.0.1','--output','/dev/null','--write-out','%{http_code}',url],timeout=15).decode().strip()
  if code!=str(status):raise ValueError('SALES_HTTP_CHECK_FAILED')
  return
 try:
  with urllib.request.urlopen(url,timeout=10) as response:actual=response.status
 except urllib.error.HTTPError as error:actual=error.code
 if actual!=status:raise ValueError('SALES_HTTP_CHECK_FAILED')

def check_home():
 with urllib.request.urlopen('http://127.0.0.1:3110/',timeout=10) as response:home=response.read(512*1024)
 if b'class="test-banner"' in home:raise ValueError('SALES_HOME_STILL_SHOWS_MOCK_MODE')

def sales_sources():
 paths=[]
 for folder in ['app','components','lib','db','scripts']:
  for path in (ROOT/folder).rglob('*'):
   if path.is_file() and not path.is_symlink() and path.suffix in ('.ts','.tsx','.mjs','.sql'):paths.append(path.relative_to(ROOT).as_posix())
 return sorted(paths+['docs/launch-progress.json','package.json','next.config.ts','tsconfig.json'])

def main():
 require_owner()
 if sys.argv[1:]!=['--activate']:raise ValueError('ROOT_ACTIVATE_ARGUMENT_REQUIRED')
 STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
 info=STATE.lstat()
 if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077:raise ValueError('PRIVATE_CONTROL_DIRECTORY_REQUIRED')
 marker=STATE/'active.json'
 if marker.exists():
  health();check_http('https://gumseo.kr/start');print('SALES_ALREADY_ACTIVE_HEALTHY; no settings changed');return
 sources=sales_sources()
 digest=hashlib.sha256()
 for path in sources:digest.update(path.encode()+b'\0'+(ROOT/path).read_bytes()+b'\0')
 expected_digest=digest.hexdigest()
 print('1/8 최신 실행 이미지 확인 (사이트는 유지됩니다)',flush=True)
 # The normal updater acquires its own lock: run it before taking the shared lock.
 for attempt in range(41):
  try:
   try:run(['systemctl','start','gumseo-private-update.service'],timeout=600)
   except ValueError:raise RuntimeError('EXISTING_UPDATER_FAILED')
   image_digest=run(['docker','run','--rm','--network','none','--entrypoint','node','gumseo-local-worker:local','-e',"process.stdout.write(JSON.parse(require('node:fs').readFileSync('/app/dist/sales-build-id.json','utf8')).digest)"],timeout=20).decode().strip()
   if image_digest!=expected_digest:raise ValueError('NEW_SALES_IMAGE_NOT_PUBLISHED_YET')
   break
  except ValueError:
   if attempt==40:raise ValueError('NEW_SALES_IMAGE_NOT_PUBLISHED_YET')
   print('새 이미지 발행 대기 중...',flush=True);time.sleep(15)
 lock=LOCK.open('a');fcntl.flock(lock,fcntl.LOCK_EX)
 print('2/8 기존 설정 파일 권한 정리',flush=True)
 for path in SOURCES:repair(path)
 module=runtime_module()
 expected=module.build_runtime(module.read_private(module.LOCAL),module.read_private(module.CREDENTIALS),module.read_private(module.AI))
 if not ENV.exists():module.write_new(ENV,expected)
 else:
  repair(ENV);stored=module.read_private(ENV)
  if any(stored.get(k)!=v for k,v in expected.items()):raise ValueError('EXISTING_SALES_RUNTIME_CHANGED_REVIEW_REQUIRED')
 previous_env=ENV.read_bytes();previous_caddy=CADDY.read_bytes()
 write(STATE/'original-runtime.env',previous_env);write(STATE/'original-caddy',previous_caddy)
 shutil.copyfile(ROOT/'deploy/iwinv/compose.sales-candidate.yml',COMPOSE);os.chmod(COMPOSE,0o644)
 proxy_changed=False
 try:
  print('3/8 분리된 판매 DB·서비스 준비',flush=True)
  run(SALES+['config','--quiet']);run(SALES+['up','--no-build','storage'])
  # Preserve the chosen administrator password and visit history, without copying demo orders.
  export_code="""const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true});d.exec('BEGIN');const has=t=>d.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?\").get(t);const tables={};for(const t of ['admin_credentials','visits','visit_events','visit_networks','visit_exclusions'])tables[t]=has(t)?d.prepare('SELECT * FROM '+t).all():[];const liveOrders=has('toss_live_orders')?Number(d.prepare('SELECT count(*) AS n FROM toss_live_orders').get().n):0;process.stdout.write(JSON.stringify({version:1,liveOrders,tables}));d.exec('COMMIT');d.close()"""
  bootstrap=run(['docker','exec','gumseo-local-web-1','node','-e',export_code])
  run(SALES+['run','--rm','--no-deps','-T','worker','node','dist/sales-enroll.js','--import-operator'],data=bootstrap)
  del bootstrap
  print('4/8 결제·AI·메일 서명 등록 (외부 호출 없음)',flush=True)
  run(SALES+['run','--rm','--no-deps','-T','worker','node','dist/sales-enroll.js','--enroll'])
  print('5/8 전환 파일·DB 일치 검증',flush=True)
  run(SALES+['run','--rm','--no-deps','-T','worker','node','dist/sales-enroll.js','--check'])
  # Validate proxy config before enabling any public route.
  run(['docker','run','--rm','-i','--network','none','--read-only','--tmpfs','/data','--tmpfs','/config','--entrypoint','caddy','caddy:2.11.9-alpine','validate','--config','-','--adapter','caddyfile'],data=(ROOT/'deploy/iwinv/Caddyfile.sales-candidate').read_bytes())
  print('6/8 판매 서비스 시작·상태 확인',flush=True)
  write(ENV,activate_env(previous_env.decode()));run(SALES+['up','-d','--no-build','--no-deps','web','worker']);health()
  check_http('http://127.0.0.1:3110/start');
  check_home()
  check_http('http://127.0.0.1:3110/api/local-mail/blocked',401)
  run(SALES+['run','--rm','--no-deps','-T','worker','node','dist/runtime-backup.js'])
  run(['install','-m','755',str(ROOT/'deploy/iwinv/automation.py'),'/usr/local/sbin/gumseo-private-automation'])
  run(['install','-m','755',str(ROOT/'deploy/iwinv/monitor.py'),'/usr/local/sbin/gumseo-private-monitor'])
  print('7/8 도메인 전환',flush=True)
  write(CADDY,(ROOT/'deploy/iwinv/Caddyfile.sales-candidate').read_bytes(),0o644);proxy_changed=True
  run(REVIEW+['up','-d','--no-build','--no-deps','--force-recreate','proxy'])
  for _ in range(10):
   try:check_http('https://gumseo.kr/start');check_http('https://gumseo.kr/api/local-mail/blocked',404);break
   except (ValueError,OSError):time.sleep(2)
  else:raise ValueError('SALES_PUBLIC_PATH_NOT_READY')
  print('8/8 자동 배포·백업·판매 상태 등록',flush=True)
  write(marker,json.dumps({'version':1,'activatedAt':int(time.time()),'origin':'https://gumseo.kr','scriptedProviderCalls':0}).encode())
  print('SALES_ACTIVATED · https://gumseo.kr · 관리자 https://gumseo.kr/admin · 직접 시험 결제/메일/AI 호출은 하지 않았습니다.',flush=True)
 except BaseException:
  if proxy_changed:
   write(CADDY,previous_caddy,0o644)
   try:run(REVIEW+['up','-d','--no-build','--no-deps','--force-recreate','proxy'])
   except Exception:print('PROXY_ROLLBACK_REQUIRES_REVIEW',flush=True)
  # Stop the new worker so failures cannot leave a hidden sender/generator running.
  try:run(SALES+['stop','worker','web'])
  except Exception:pass
  write(ENV,previous_env)
  print('SALES_BATCH_STOPPED; 기존 도메인 설정 복원 시도 완료; 기존 DB·키·reader 보존',flush=True)
  raise
 finally:lock.close()
if __name__=='__main__':
 def interrupted(*_):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
 try:main()
 except KeyboardInterrupt:print('SALES_BATCH_CANCELLED; 전환 중이었다면 복원 절차를 실행했습니다.',file=sys.stderr);sys.exit(130)
 except Exception as error:
  code=str(error) if isinstance(error,(ValueError,RuntimeError)) and re.fullmatch(r'[A-Z_0-9]{3,100}',str(error)) else 'SALES_BATCH_FAILED'
  print(code+'; 비밀값은 출력하지 않습니다.',file=sys.stderr);sys.exit(1)
