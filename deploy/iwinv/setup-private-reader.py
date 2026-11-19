#!/usr/bin/env python3
"""Explicit owner-run setup. Key is entered without echo; never sent to repository or logs."""
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error

def run(args):
    return subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def existing_key(paths):
    for path in paths:
        if path.exists():
            if path.is_symlink(): raise ValueError('UNSAFE_PRIVATE_KEY_FILE')
            for line in path.read_text().splitlines():
                if line.startswith('OPENAI_API_KEY='):
                    value=line.split('=',1)[1].strip().strip('"').strip("'")
                    if re.fullmatch(r'sk-[A-Za-z0-9_-]{20,}',value): return value
    return None

def configure_proxy(root,destination):
    caddy=destination/'Caddyfile.merchant-review'
    if not caddy.exists():raise ValueError('INSTALL_MERCHANT_REVIEW_FIRST')
    old=caddy.read_bytes()
    if old==(root/'deploy/iwinv/Caddyfile.merchant-review').read_bytes():return
    shutil.copyfile(root/'deploy/iwinv/Caddyfile.merchant-review',caddy)
    review=['docker','compose','-f',str(destination/'compose.merchant-review.yml')]
    try:
        run(review+['exec','-T','proxy','caddy','validate','--config','/etc/caddy/Caddyfile'])
    except subprocess.CalledProcessError:
        caddy.write_bytes(old)
        raise ValueError('PRIVATE_PROXY_CONFIGURATION_REJECTED')
    try:
        run(review+['exec','-T','proxy','caddy','reload','--config','/etc/caddy/Caddyfile'])
    except subprocess.CalledProcessError:
        # Caddy admin is disabled. Recreate only the already-validated proxy.
        run(review+['up','-d','--no-build','--no-deps','--force-recreate','proxy'])

def main():
    if os.geteuid()!=0: raise ValueError('RUN_WITH_SUDO')
    root=Path(__file__).resolve().parents[2]
    run(['systemctl','start','gumseo-private-update.service'])
    run(['docker','run','--rm','--network','none','--entrypoint','node','gumseo-local-worker:local','-e',"const f=require('node:fs');for(const p of ['/app/dist/private-reader-server.js','/app/public/private-reader/index.html','/app/public/private-reader/reader.js'])f.accessSync(p)"])
    env=Path('/etc/gumseo/private-reader.env')
    key=existing_key([env,Path('/etc/gumseo/test.env'),Path('/opt/gumseo/source/.env.local')])
    if key and not env.exists():
        if input('기존 OpenAI 키를 /etc/gumseo/private-reader.env 에 비공개 저장할까요? yes 입력: ').strip().lower()!='yes': raise ValueError('KEY_DESTINATION_NOT_CONFIRMED')
    if not key:
        print('OpenAI 키를 /etc/gumseo/private-reader.env 에 비공개 저장합니다. 입력은 표시되지 않습니다. 원치 않으면 Ctrl+C로 취소하세요.')
        key=getpass.getpass('OpenAI API key (hidden): ').strip()
    if not re.fullmatch(r'sk-[A-Za-z0-9_-]{20,}',key):raise ValueError('INVALID_OPENAI_KEY')
    env.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    if env.is_symlink():raise ValueError('UNSAFE_PRIVATE_KEY_FILE')
    if not existing_key([env]):
        staged=env.with_name('private-reader.env.new')
        descriptor=os.open(staged,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as file:file.write('OPENAI_API_KEY='+key+'\n')
        os.replace(staged,env)
    del key
    os.chmod(env,0o600)
    storage=Path('/var/lib/gumseo-private-reader');storage.mkdir(mode=0o700,parents=True,exist_ok=True)
    if storage.is_symlink():raise ValueError('UNSAFE_PRIVATE_STORAGE')
    os.chmod(storage,0o700)
    os.chown(storage,1000,1000)
    destination=Path('/usr/local/lib/gumseo');destination.mkdir(mode=0o755,parents=True,exist_ok=True)
    shutil.copyfile(root/'deploy/iwinv/compose.private-reader.yml',destination/'compose.private-reader.yml')
    args=['docker','compose','-f',str(destination/'compose.private-reader.yml')]
    run(args+['config','--quiet']);run(args+['up','-d','--no-build'])
    healthy=False
    for _ in range(40):
        access=storage/'access.json'
        try:
            urllib.request.urlopen('http://127.0.0.1:3450/private-reading',timeout=1)
        except urllib.error.HTTPError as response:
            if response.code==403 and access.exists():
                healthy=True
                break
        except OSError:
            pass
        time.sleep(.5)
    if not healthy:raise ValueError('PRIVATE_READER_START_FAILED')
    configure_proxy(root,destination)
    data=json.loads(access.read_text())
    token=data.get('invite','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):raise ValueError('PRIVATE_INVITE_INVALID')
    print('비공개 실제 AI 풀이 페이지 준비 완료. 아래 주소는 초대한 사람에게만 공유하세요:')
    print('https://pay.gumseo.kr/private-reading/invite/'+token)
    print('한국어/臺灣繁體中文 · 한국 1989년 이후/대만 1980년 이후 양력 · 검증2회와 별도로 초대 페이지8회, 추정 예약 합계 $0.48 · 실결제/메일 없음')

if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:
        print('설치를 취소했습니다. 비밀값은 출력하지 않았습니다.',file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        messages={
            'RUN_WITH_SUDO':'sudo python3 deploy/iwinv/setup-private-reader.py 로 실행하세요.',
            'KEY_DESTINATION_NOT_CONFIRMED':'키 저장을 취소했습니다. 저장 경로 확인 후 다시 실행할 수 있습니다.',
            'INVALID_OPENAI_KEY':'키 형식이 맞지 않습니다. OpenAI API 키를 서버의 숨김 입력창에 입력하세요.',
            'PRIVATE_READER_START_FAILED':'전용 서버가 시작되지 않았습니다. docker compose -f /usr/local/lib/gumseo/compose.private-reader.yml logs --tail 20 reader 로 상태를 확인하세요.',
            'PRIVATE_PROXY_CONFIGURATION_REJECTED':'프록시 검증 실패로 기존 설정을 복원했습니다. 최신 main을 받아 다시 실행하세요.',
            'INSTALL_MERCHANT_REVIEW_FIRST':'기존 심사 사이트 설치가 먼저 필요합니다.',
        }
        print('PRIVATE_READER_SETUP_INCOMPLETE: '+messages.get(str(error),'서버 설정·비공개 파일 권한을 확인하세요. 비밀값은 출력하지 않았습니다.'),file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError:
        print('PRIVATE_READER_SETUP_INCOMPLETE: 런타임 업데이트 또는 컨테이너 명령이 실패했습니다. GitHub 런타임 발행 성공 후 sudo systemctl start gumseo-private-update.service 를 실행하고 설치를 다시 시도하세요. 키는 출력하지 않았습니다.',file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('PRIVATE_READER_SETUP_INCOMPLETE: 서버 파일·권한 상태를 확인하세요. 키는 출력하지 않았습니다.',file=sys.stderr)
        sys.exit(1)
