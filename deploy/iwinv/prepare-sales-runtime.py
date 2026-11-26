#!/usr/bin/env python3
"""Prepare the approved sales env only. No requests, enrollments, service restarts or activation."""
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

TARGET=Path('/etc/gumseo/sales/runtime.env')
CREDENTIALS=Path('/etc/gumseo/sales/credentials.env')
LOCAL=Path('/etc/gumseo/test.env')
AI=Path('/etc/gumseo/private-reader.env')

def read_private(path):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  info=os.fstat(fd)
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077 or info.st_nlink!=1 or info.st_size>65536:raise ValueError('PRIVATE_CONFIG_FILE_REQUIRED')
  with os.fdopen(fd,'r',closefd=False) as source:
   values={}
   for line in source:
    line=line.strip()
    if not line or line.startswith('#'):continue
    if '=' not in line:raise ValueError('PLAIN_ENV_REQUIRED')
    key,value=line.split('=',1)
    if not re.fullmatch(r'[A-Z][A-Z0-9_]*',key) or key in values:raise ValueError('PLAIN_UNIQUE_ENV_REQUIRED')
    values[key]=value.strip().strip('\"\'')
   return values
 finally:os.close(fd)

def build_runtime(local,credentials,ai):
 for name in ['DATA_KEY','AUTH_SECRET','ADMIN_PASSWORD','ADMIN_TOTP_SECRET']:
  if len(local.get(name,''))<32:raise ValueError('EXISTING_APPLICATION_KEYS_REQUIRED')
 if not re.fullmatch(r'[a-f0-9]{64}',local['DATA_KEY']):raise ValueError('INVALID_DATA_KEY')
 if not re.fullmatch(r'(?:[a-f0-9]{2}){20,64}',local['ADMIN_TOTP_SECRET'],re.I):raise ValueError('INVALID_ADMIN_SEED')
 if not re.fullmatch(r'sk-[A-Za-z0-9_-]{20,}',ai.get('OPENAI_API_KEY','')):raise ValueError('EXISTING_AI_KEY_REQUIRED')
 patterns={
  'TOSS_LIVE_CLIENT_KEY':r'live_gck_[A-Za-z0-9_]{8,500}',
  'TOSS_LIVE_SECRET_KEY':r'live_gsk_[A-Za-z0-9_]{8,500}',
  'TOSS_LIVE_MERCHANT_ID':r'[A-Za-z0-9_-]{1,100}',
  'RESEND_API_KEY':r're_[A-Za-z0-9_-]{8,256}',
  'RESEND_ACCOUNT_SCOPE':r'[A-Za-z0-9_-]{1,48}',
  'TRANSACTION_MAIL_SENDER':r'[^\s@=]+@[^\s@=]+\.[^\s@=]+',
  'TRANSACTION_MAIL_REPLY_TO':r'[^\s@=]+@[^\s@=]+\.[^\s@=]+',
 }
 for name,pattern in patterns.items():
  if not re.fullmatch(pattern,credentials.get(name,'')):raise ValueError('SALES_CREDENTIALS_INCOMPLETE')
 values={name:local[name] for name in ['DATA_KEY','AUTH_SECRET','ADMIN_PASSWORD','ADMIN_TOTP_SECRET']}
 values.update({name:credentials[name] for name in patterns})
 values.update({
  'OPENAI_API_KEY':ai['OPENAI_API_KEY'],
  'APP_MODE':'local','EXTERNAL_EFFECTS':'disabled','APP_ORIGIN':'https://gumseo.kr',
  'DATABASE_PATH':'/data/geumseo.sqlite','REPORT_YEAR':'2027',
  'TOSS_PAYMENT_MODE':'disabled','AI_WORKER_MODE':'disabled','MAIL_WORKER_MODE':'disabled',
  'TOSS_LIVE_CUTOVER_FILE':'/data/private/toss-live.json',
  'AI_CUTOVER_FILE':'/data/private/ai.json','MAIL_CUTOVER_FILE':'/data/private/mail.json',
  'AI_REPORT_PROFILE':'rich-ko-v1',
  'AI_DAILY_USD_MICROS':'5000000','AI_LIFETIME_USD_MICROS':'30000000','AI_RESERVATION_USD_MICROS':'500000',
 })
 if any(not re.fullmatch(r'[A-Z][A-Z0-9_]*',k) or not v or any(c in v for c in '\n\r\x00\"\'`$\\') for k,v in values.items()):raise ValueError('PLAIN_SAFE_ENV_VALUES_REQUIRED')
 return values

def write_new(path,values):
 parent=path.parent.lstat()
 if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.geteuid() or parent.st_mode&0o077:raise ValueError('PRIVATE_DIRECTORY_REQUIRED')
 fd,temp=tempfile.mkstemp(prefix='.sales-runtime-',dir=path.parent)
 try:
  with os.fdopen(fd,'w') as dest:
   dest.write('# Prepared sales runtime; provider modes remain disabled.\n')
   for key,value in values.items():dest.write(key+'='+value+'\n')
   dest.flush();os.fsync(dest.fileno())
  os.link(temp,path,follow_symlinks=False)
  directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(directory)
  finally:os.close(directory)
 finally:os.unlink(temp)

def main():
 if os.geteuid()!=0 or sys.argv[1:]!=['--prepare']:raise ValueError('ROOT_PREPARE_ARGUMENT_REQUIRED')
 if TARGET.exists() or TARGET.is_symlink():raise ValueError('SALES_RUNTIME_ALREADY_EXISTS_NO_OVERWRITE')
 values=build_runtime(read_private(LOCAL),read_private(CREDENTIALS),read_private(AI))
 write_new(TARGET,values)
 print('SALES_RUNTIME_PREPARED; 기존 AI 키 재사용; 운영 키·메일 연결 설정 보관; 비밀값 출력 없음')
 print('AI 비용 한도: 건당 예약 $0.50 / 하루 $5 / 누적 $30. 실제 요금과 다릅니다.')
 print('결제·AI·메일 모드는 비활성 유지. 기존 서비스·DB·개인 키는 변경하지 않았습니다.')
if __name__=='__main__':
 try:main()
 except Exception as error:
  code=str(error) if isinstance(error,ValueError) and re.fullmatch(r'[A-Z_]{3,90}',str(error)) else 'SALES_RUNTIME_PREPARATION_FAILED'
  print(code+'; 비밀값은 출력하지 않습니다.',file=sys.stderr);sys.exit(1)
