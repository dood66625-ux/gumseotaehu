#!/usr/bin/env bash
# Owner's interactive SSH terminal only; no credential rotation or provider calls.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ -t 0 && -t 1 ]] || { echo 'INTERACTIVE_OWNER_TERMINAL_REQUIRED'; exit 1; }
docker exec -i gumseo-local-web-1 node --input-type=module > /dev/tty <<'JS'
import {createHmac} from 'node:crypto';
const password=process.env.ADMIN_PASSWORD;
const seed=process.env.ADMIN_TOTP_SECRET;
if(!password || !/^(?:[a-f0-9]{2}){20,64}$/i.test(seed??'')) {
  console.error('ADMIN_CONFIGURATION_UNAVAILABLE'); process.exit(1);
}
const now=Date.now(), counter=Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
const mac=createHmac('sha1',Buffer.from(seed,'hex')).update(counter).digest();
const offset=mac[mac.length-1]&15;
const code=String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
console.log('관리자 로그인: https://gumseo.kr/admin');
console.log('비밀번호: '+password);
console.log('현재 인증코드: '+code+' (약 '+Math.ceil((30000-now%30000)/1000)+'초 남음)');
console.log('비밀번호와 코드는 채팅·스크린샷으로 보내지 마세요. 만료되면 다시 실행하세요.');
JS
