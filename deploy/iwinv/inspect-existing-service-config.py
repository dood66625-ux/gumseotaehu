#!/usr/bin/env python3
"""Read-only inventory of this application's credential presence, never credential values."""
import os
import stat
from pathlib import Path

def inspect(path):
    try:
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            info=os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size>65536:
                return None
            with os.fdopen(fd,'r',closefd=False) as source:
                values={}
                for line in source:
                    line=line.strip()
                    if line.startswith('export '):line=line[7:]
                    if not line or line.startswith('#') or '=' not in line:continue
                    name,value=line.split('=',1)
                    values[name.strip()]=value.strip().strip('\"\'')
        finally:os.close(fd)
        keys=[values.get(k,'') for k in ('TOSS_LIVE_SECRET_KEY','TOSS_SECRET_KEY','TOSS_TEST_SECRET_KEY')]
        return {'file':Path(path).name,'ai':bool(values.get('OPENAI_API_KEY')),
                'mail':bool(values.get('RESEND_API_KEY')),
                'tossLive':any(k.startswith(('live_gsk_','live_sk_')) for k in keys),
                'tossTest':any(k.startswith(('test_gsk_','test_sk_')) for k in keys)}
    except (OSError,UnicodeError):return None

def main():
    if os.geteuid()!=0:raise SystemExit('Run with sudo')
    print('기존 설정 위치 (존재 여부만 확인; 설정 변경·외부 요청 없음)')
    paths=sorted(Path('/etc/gumseo').glob('*.env'))+[Path('/etc/gumseo/sales/credentials.env'),Path('/etc/gumseo/sales/runtime.env'),Path('/opt/gumseo/source/.env.local')]
    for path in paths:
        row=inspect(path)
        if row:
            yes=lambda key:'있음' if row[key] else '없음'
            print(f"{row['file']}: AI {yes('ai')} / 메일 {yes('mail')} / 토스 운영키 {yes('tossLive')} / 토스 테스트키 {yes('tossTest')}")
if __name__=='__main__':main()
