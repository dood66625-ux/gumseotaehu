#!/usr/bin/python3
"""One-time owner installation. No shared secret, SSH key or Docker socket is exposed."""
import fcntl
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request

BEGIN = '\t# BEGIN GUMSEO PUBLISH NOTIFY'
END = '\t# END GUMSEO PUBLISH NOTIFY'
BLOCK = BEGIN+'\n\t@publish_notify path /_internal/update-notify\n\treverse_proxy @publish_notify 127.0.0.1:3461\n'+END+'\n'

def with_notify_route(text):
    sites=list(re.finditer(r'(?m)^gumseo\.kr \{\n', text))
    if len(sites) != 1: raise ValueError('NOTIFY_PROXY_SITE_REQUIRED')
    if BEGIN in text or END in text:
        if text.count(BEGIN)!=1 or text.count(END)!=1: raise ValueError('NOTIFY_PROXY_REVIEW_REQUIRED')
        start=text.index(BEGIN); finish=text.index(END,start)+len(END)
        if finish<len(text) and text[finish]=='\n':finish+=1
        return text[:start]+BLOCK+text[finish:]
    if '/_internal/update-notify' in text: raise ValueError('NOTIFY_PROXY_REVIEW_REQUIRED')
    return text[:sites[0].end()]+BLOCK+text[sites[0].end():]

def run(args):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180).stdout

def main():
    if os.geteuid()!=0:raise ValueError('RUN_WITH_SUDO')
    root=Path(__file__).resolve().parents[2]
    destination=Path('/usr/local/lib/gumseo')
    caddy=destination/'Caddyfile.merchant-review'
    review=destination/'compose.merchant-review.yml'
    if not caddy.is_file() or not review.is_file() or caddy.is_symlink():raise ValueError('NOTIFY_PROXY_INSTALL_REQUIRED')
    run(['/usr/bin/docker','image','inspect','gumseo-local-worker:local'])
    with Path('/var/lib/gumseo-automation/lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        code=destination/'update-notify';code.mkdir(mode=0o755,exist_ok=True)
        for name in ['update-notify-server.mjs','update-notify-identity.mjs']:
            shutil.copyfile(root/'scripts'/name,code/name);os.chmod(code/name,0o644)
        storage=Path('/var/lib/gumseo-update-notify');storage.mkdir(mode=0o700,exist_ok=True)
        requests=storage/'requests';requests.mkdir(mode=0o700,exist_ok=True)
        if requests.is_symlink():raise ValueError('NOTIFY_STORAGE_REQUIRED')
        os.chown(requests,1000,1000);os.chmod(requests,0o700)
        compose=destination/'compose.update-notify.yml'
        shutil.copyfile(root/'deploy/iwinv/compose.update-notify.yml',compose)
        args=['/usr/bin/docker','compose','-f',str(compose)]
        run(args+['config','--quiet']);run(args+['up','-d','--no-build','--force-recreate'])
        healthy=False
        for _ in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:3461/_internal/update-notify',timeout=2) as response:
                    healthy=json.loads(response.read(1024)).get('service')=='gumseo-update-notify'
                if healthy:break
            except (OSError,ValueError):pass
            time.sleep(1)
        if not healthy:raise ValueError('NOTIFY_RECEIVER_NOT_READY')
        previous=caddy.read_text(); updated=with_notify_route(previous)
        proxy=['/usr/bin/docker','compose','-f',str(review)]
        if updated!=previous:
            caddy.write_text(updated)
            try:run(proxy+['exec','-T','proxy','caddy','validate','--config','/etc/caddy/Caddyfile'])
            except subprocess.CalledProcessError:
                caddy.write_text(previous);raise ValueError('NOTIFY_PROXY_CONFIG_REJECTED') from None
            try:run(proxy+['up','-d','--no-build','--no-deps','--force-recreate','proxy'])
            except subprocess.CalledProcessError:
                caddy.write_text(previous)
                run(proxy+['up','-d','--no-build','--no-deps','--force-recreate','proxy'])
                raise ValueError('NOTIFY_PROXY_START_FAILED') from None
        shutil.copyfile(root/'deploy/iwinv/update-notify.path','/etc/systemd/system/gumseo-private-update-notify.path')
        run(['systemctl','daemon-reload'])
        run(['systemctl','enable','--now','gumseo-private-update-notify.path'])
    print('PUBLISH_NOTIFY_INSTALLED; GitHub identity required; fixed update service only; timer fallback retained.')

if __name__=='__main__':
    try:main()
    except Exception:
        print('PUBLISH_NOTIFY_INSTALL_FAILED; no credential/token output; inspect local service configuration.',file=sys.stderr)
        sys.exit(1)
