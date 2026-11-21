#!/usr/bin/python3
"""Owner-only offline MFA enrollment/recovery. Secret values go only to private files."""
import argparse
import base64
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import tempfile
from urllib.parse import quote, urlencode, urlsplit

COMPOSE = '/usr/local/lib/gumseo/compose.local.yml'

def private_parent(path):
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError('PRIVATE_PROVISION_DIRECTORY_REQUIRED')

def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def provision(target, output):
    target, output = Path(target), Path(output)
    checkout=Path(__file__).resolve().parents[2]
    if target.resolve().is_relative_to(checkout): raise ValueError('ENV_FILE_OUTSIDE_WORKTREE_REQUIRED')
    if output.resolve().is_relative_to(checkout):
        raise ValueError('PROVISION_FILE_OUTSIDE_WORKTREE_REQUIRED')
    if target.name in ('toss-sandbox.env','private-reader.env'): raise ValueError('SEPARATE_SERVICE_CONFIG_REFUSED')
    private_parent(output.parent)
    parent = target.parent.stat()
    if parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
        raise ValueError('PRIVATE_CONFIG_PARENT_REQUIRED')
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_nlink != 1 or info.st_size > 65536:
            raise ValueError('PRIVATE_OWNED_CONFIG_REQUIRED')
        with os.fdopen(fd, 'r', closefd=False) as source: text=source.read()
    finally: os.close(fd)
    rows=text.splitlines(); values={}
    for row in rows:
        if not row.strip() or row.lstrip().startswith('#'): continue
        if '=' not in row: raise ValueError('PLAIN_ENV_CONFIG_REQUIRED')
        key,value=row.split('=',1)
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*',key) or key in values: raise ValueError('PLAIN_UNIQUE_ENV_REQUIRED')
        values[key]=value
    if values.get('APP_MODE')!='local' or values.get('EXTERNAL_EFFECTS')!='disabled': raise ValueError('KNOWN_APPLICATION_CONFIG_REQUIRED')
    origin=values.get('APP_ORIGIN',''); parsed=urlsplit(origin)
    if parsed.scheme!='https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise ValueError('OPERATOR_HTTPS_ORIGIN_REQUIRED')
    if not all(values.get(k) for k in ['DATA_KEY','AUTH_SECRET','ADMIN_PASSWORD','ADMIN_TOTP_SECRET']): raise ValueError('INCOMPLETE_CONFIG')
    password=secrets.token_hex(24); seed=secrets.token_hex(20)
    secret32=base64.b32encode(bytes.fromhex(seed)).decode().rstrip('=')
    uri='otpauth://totp/'+quote('금서태후:운영자',safe='')+'?'+urlencode({'secret':secret32,'issuer':'금서태후','algorithm':'SHA1','digits':'6','period':'30'})
    bundle={'purpose':'owner-offline-authenticator-enrollment','origin':origin,'createdAt':datetime.now(timezone.utc).isoformat(),'password':password,'totpSecretBase32':secret32,'authenticatorUri':uri}
    bundle_fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    temporary=None; applied=False
    try:
        with os.fdopen(bundle_fd,'w') as private:
            json.dump(bundle,private,ensure_ascii=False);private.write('\n');private.flush();os.fsync(private.fileno())
        sync_dir(output.parent)
        replacements={'ADMIN_PASSWORD':password,'ADMIN_TOTP_SECRET':seed}
        changed='\n'.join((row.split('=',1)[0]+'='+replacements[row.split('=',1)[0]]) if '=' in row and row.split('=',1)[0] in replacements else row for row in rows)+'\n'
        temp_fd,temporary=tempfile.mkstemp(prefix='.operator-',dir=target.parent)
        with os.fdopen(temp_fd,'w') as dest:
            dest.write(changed);dest.flush();os.fsync(dest.fileno())
        current=os.stat(target,follow_symlinks=False)
        if (current.st_ino,current.st_mtime_ns,current.st_size)!=(info.st_ino,info.st_mtime_ns,info.st_size): raise ValueError('CONFIG_CHANGED_DURING_PROVISIONING')
        os.replace(temporary,target); temporary=None;applied=True
        sync_dir(target.parent)
    except Exception:
        if not applied: output.unlink(missing_ok=True)
        else: raise ValueError('ADMIN_PROVISIONING_COMMIT_UNCERTAIN') from None
        raise
    finally:
        if temporary is not None: os.unlink(temporary)

def assert_offline(env_file="/etc/gumseo/test.env"):
    for unit in ['gumseo-private-update.timer','gumseo-private-update-notify.path','gumseo-private-update.service']:
        result=subprocess.run(['systemctl','is-active','--quiet',unit],capture_output=True,timeout=10)
        if result.returncode not in (3,4): raise ValueError('STOP_AUTOMATIC_UPDATES_FIRST')
    result=subprocess.run(['/usr/bin/docker','compose','--env-file',str(env_file),'-f',COMPOSE,'ps','-q','--status','running'],capture_output=True,check=True,timeout=20)
    if result.stdout.strip(): raise ValueError('STOP_MAIN_WEB_AND_WORKER_FIRST')

def main():
    parser=argparse.ArgumentParser(description='Offline owner provisioning; no secret values printed')
    parser.add_argument('--env-file',required=True);parser.add_argument('--provision-file',required=True);parser.add_argument('--offline',action='store_true')
    args=parser.parse_args()
    if os.geteuid()!=0 or not args.offline: raise ValueError('ROOT_OFFLINE_REQUIRED')
    with Path('/var/lib/gumseo-automation/lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise ValueError('WAIT_FOR_AUTOMATION_LOCK') from None
        assert_offline(args.env_file)
        provision(args.env_file,args.provision_file)
    print('OPERATOR_PROVISIONED; private enrollment file created; configure authenticator locally; services remain stopped; customer signing/data/provider keys preserved.')

if __name__=='__main__':
    try: main()
    except Exception as error:
        allowed={'ENV_FILE_OUTSIDE_WORKTREE_REQUIRED','WAIT_FOR_AUTOMATION_LOCK','PRIVATE_PROVISION_DIRECTORY_REQUIRED','PRIVATE_CONFIG_PARENT_REQUIRED','PRIVATE_OWNED_CONFIG_REQUIRED','PLAIN_ENV_CONFIG_REQUIRED','PLAIN_UNIQUE_ENV_REQUIRED','KNOWN_APPLICATION_CONFIG_REQUIRED','OPERATOR_HTTPS_ORIGIN_REQUIRED','INCOMPLETE_CONFIG','CONFIG_CHANGED_DURING_PROVISIONING','ADMIN_PROVISIONING_COMMIT_UNCERTAIN','STOP_AUTOMATIC_UPDATES_FIRST','STOP_MAIN_WEB_AND_WORKER_FIRST','ROOT_OFFLINE_REQUIRED','PROVISION_FILE_OUTSIDE_WORKTREE_REQUIRED','SEPARATE_SERVICE_CONFIG_REFUSED'}
        code=str(error) if isinstance(error,ValueError) and str(error) in allowed else 'LOCAL_REVIEW_REQUIRED'
        print('OPERATOR_PROVISIONING_NOT_CONFIRMED ['+code+']; inspect private files and stopped services locally; no values printed')
        raise SystemExit(1)
