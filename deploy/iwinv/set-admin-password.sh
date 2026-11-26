#!/usr/bin/env bash
# Owner-only interactive setup/recovery. Secrets never appear in argv or logs.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ -t 0 && -t 1 ]] || { echo 'INTERACTIVE_OWNER_TERMINAL_REQUIRED'; exit 1; }
IFS= read -rsp '새 관리자 비밀번호 (12~200자): ' gumseo_password
printf '\n'
IFS= read -rsp '같은 비밀번호 다시 입력: ' gumseo_confirm
printf '\n'
[[ "$gumseo_password" == "$gumseo_confirm" ]] || { echo '비밀번호가 일치하지 않습니다.'; exit 1; }
gumseo_container=gumseo-local-web-1
if [[ -f /var/lib/gumseo-sales-control/active.json ]]; then gumseo_container=gumseo-sales-web-1; fi
printf '%s' "$gumseo_password" | docker exec -i "$gumseo_container" node --input-type=module -e '
import {readFileSync} from "node:fs";
import {randomBytes,scryptSync} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const password=readFileSync(0,"utf8");
if(password.length<12||password.length>200){console.error("비밀번호는 12~200자로 설정해주세요.");process.exit(1)}
const db=new DatabaseSync(process.env.DATABASE_PATH);
db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
try {
 db.exec("CREATE TABLE IF NOT EXISTS admin_credentials(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT NOT NULL)");
 const salt=randomBytes(24).toString("hex");
 db.prepare("INSERT INTO admin_credentials VALUES(1,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest").run(salt+":"+scryptSync(password,salt,64).toString("hex"));
 db.exec("DELETE FROM sessions WHERE role!=char(99,117,115,116,111,109,101,114); COMMIT");
 console.log("비밀번호 설정 완료: https://gumseo.kr/admin · 기존 관리자 세션은 종료했습니다.");
} catch {db.exec("ROLLBACK");console.error("비밀번호 설정 실패");process.exitCode=1} finally {db.close()}
'
unset gumseo_password gumseo_confirm
