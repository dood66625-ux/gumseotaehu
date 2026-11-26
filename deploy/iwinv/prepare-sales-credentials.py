#!/usr/bin/env python3
"""Owner-terminal staging for Toss/Resend credentials. No activation, AI changes, or HTTP calls."""
import getpass
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

TARGET=Path('/etc/gumseo/sales/credentials.env')
PATTERNS={
 'TOSS_LIVE_CLIENT_KEY':r'live_gck_[A-Za-z0-9_]{8,500}',
 'TOSS_LIVE_SECRET_KEY':r'live_gsk_[A-Za-z0-9_]{8,500}',
 'TOSS_LIVE_MERCHANT_ID':r'[A-Za-z0-9_-]{1,100}',
 'RESEND_API_KEY':r're_[A-Za-z0-9_-]{8,500}',
 'TRANSACTION_MAIL_SENDER':r'[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
 'TRANSACTION_MAIL_REPLY_TO':r'[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
 'RESEND_ACCOUNT_SCOPE':r'[A-Za-z0-9_-]{1,100}',
}
def validate(name,value):return bool(re.fullmatch(PATTERNS[name],value))
def read_existing(path):
 if not path.exists() and not path.is_symlink():return {}
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  info=os.fstat(fd)
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077 or info.st_nlink!=1 or info.st_size>65536:
   raise ValueError('PRIVATE_CREDENTIAL_FILE_REQUIRED')
  with os.fdopen(fd,'r',closefd=False) as source:
   result={}
   for line in source:
    if '=' in line and not line.startswith('#'):
     key,value=line.rstrip('\n').split('=',1)
     if key in PATTERNS and validate(key,value):result[key]=value
   return result
 finally:os.close(fd)
def write_private(path,values):
 if any(k not in PATTERNS or not validate(k,v) for k,v in values.items()):raise ValueError('INVALID_CREDENTIAL_FORMAT')
 if any(k.startswith(('OPENAI','AI_')) for k in values):raise ValueError('AI_SETTINGS_NOT_CHANGED')
 parent=path.parent.stat()
 if path.parent.is_symlink() or not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.geteuid() or parent.st_mode&0o077:raise ValueError('PRIVATE_DIRECTORY_REQUIRED')
 before=path.lstat() if path.exists() or path.is_symlink() else None
 if before:read_existing(path)
 fd,temp=tempfile.mkstemp(prefix='.sales-credentials-',dir=path.parent)
 try:
  with os.fdopen(fd,'w') as dest:
   dest.write('# Prepared only. No activation flags or AI credentials.\n')
   for k,v in values.items():dest.write(k+'='+v+'\n')
   dest.flush();os.fsync(dest.fileno())
  after=path.lstat() if path.exists() or path.is_symlink() else None
  fingerprint=lambda info:(info.st_ino,info.st_mtime_ns,info.st_size) if info else None
  if fingerprint(before)!=fingerprint(after):raise ValueError('CREDENTIAL_FILE_CHANGED')
  os.replace(temp,path)
  directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(directory)
  finally:os.close(directory)
 finally:
  if os.path.exists(temp):os.unlink(temp)
def collect(values):
 def ask(key,label,optional=False,default=None):
  if values.get(key):print(label+': 보관된 설정 재사용');return
  while True:
   value=getpass.getpass(label+(' (없으면 Enter)' if optional else '')+': ')
   if not value and optional:return
   if not value and default:value=default
   if validate(key,value):values[key]=value;return
   print('형식이 맞지 않습니다. 운영 키인지 확인해주세요. 값은 표시하지 않습니다.')
 ask('TOSS_LIVE_CLIENT_KEY','토스 운영 클라이언트 키 (live_gck_)')
 ask('TOSS_LIVE_SECRET_KEY','토스 운영 시크릿 키 (live_gsk_)')
 ask('TOSS_LIVE_MERCHANT_ID','토스 상점 ID (MID)')
 ask('RESEND_API_KEY','Resend API 키 (re_)',optional=True)
 if values.get('RESEND_API_KEY'):
  ask('TRANSACTION_MAIL_SENDER','인증된 도메인의 발신 이메일')
  ask('TRANSACTION_MAIL_REPLY_TO','답변 받을 이메일')
  ask('RESEND_ACCOUNT_SCOPE','내부 메일 계정 구분명 (Enter: gumseo-main)',default='gumseo-main')
 return values
def main():
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
 if not sys.stdin.isatty() or not sys.stdout.isatty():raise ValueError('INTERACTIVE_OWNER_TERMINAL_REQUIRED')
 print('입력은 화면에 보이지 않습니다. /etc/gumseo/sales/credentials.env에만 비공개 저장합니다.')
 print('기존 AI 키·서비스 설정은 유지하며 결제·메일·AI 호출을 하지 않습니다. 취소는 Ctrl+C입니다.')
 TARGET.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 values=collect(read_existing(TARGET));write_private(TARGET,values)
 print('SALES_CREDENTIALS_PREPARED; 토스 운영 키 보관 완료; 메일 키 '+('보관 완료' if values.get('RESEND_API_KEY') else '아직 없음')+'; 실제 판매 활성화 아님')
if __name__=='__main__':
 try:main()
 except (KeyboardInterrupt,EOFError):print('\n취소됨; 기존 서비스 설정은 유지했습니다.');sys.exit(1)
 except Exception as error:
  code=str(error) if isinstance(error,ValueError) and re.fullmatch(r'[A-Z_]{3,80}',str(error)) else 'SALES_CREDENTIAL_PREPARATION_FAILED'
  print(code+'; 비밀값은 출력하지 않습니다.',file=sys.stderr);sys.exit(1)
