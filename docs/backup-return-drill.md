# PC 사본을 되돌려 수행하는 오프라인 복원 시험

2026-11-22. 운영자 화면으로 서버 백업 서비스 success/exit0, PC 다운로드·SHA256 일치(BACKUP_COPY_VERIFIED), PC의 GumseoBackups/20261122-140947 보관을 확인했다. 이것만으로 외부 사본 복원·상시 경보·재해 복구 완료를 선언하지 않는다.

## 도구

`deploy/iwinv/verify-external-backup.py`는 root가 인자 없이 명시 실행하는 일회성 시험 도구다. 설치된 서비스나 sudoers를 바꾸지 않는다. 입력 위치는 /home/gumseo/gumseo-restore-input/latest.tar.gz 및 latest.sha256로 고정한다. 일반 파일/개인 디렉터리/크기/해시를 검사한다. tar는 정해진 일반 파일3개만 직접 복사하며 경로 탈출/중복/심볼릭 링크/예상 외 항목을 거절한다.

돌아온 사본의 archive.gsb와 현재 서버 export의 최신 서명 체크포인트/삭제 목록을 임시 디렉터리에 준비한다. root 소유의 기존 /etc/gumseo/test.env는 Docker가 읽으며 값을 출력하지 않는다. worker 이미지를 일회성으로 실행하되 network=none, read-only, user1000, cap-drop=ALL, no-new-privileges를 적용한다. 운영 DB/데이터 볼륨이나 Docker socket은 컨테이너에 마운트하지 않는다. 입력은 읽기 전용이며 복원 DB는 임시 tmpfs에만 만든다.

기존 dist/runtime-backup.js의 새 `--verify-external <archive> <checkpoint>` 모드는 config의 키를 검증에 사용할 뿐 운영 DB를 열지 않는다. 체크포인트 서명·시각·DB UUID·삭제 이력을 적용한 새 오프라인 DB의 무결성을 확인하고 임시 DB를 삭제한다. 원본 입력과 운영 DB는 덮어쓰지 않는다. 외부 원장 모드가 설정돼 있으면 그 검사를 우회하지 않으며 네트워크 없는 시험에서 실패할 수 있다. 과거 키의 사본이면 자동으로 키를 교체하거나 내보내지 않고 실패한다.

## 순서

1. 해당 변경의 패키지 발행·서버 worker 갱신을 확인한다.
2. Windows PC의 이미 해시가 일치한 두 파일을 전용 입력 디렉터리로 scp 전송한다. 키/env는 전송하지 않는다.
3. 원격 저장소가 깨끗한 상태에서 최신 main을 받고, 운영자가 `sudo python3 deploy/iwinv/verify-external-backup.py`를 실행한다.
4. returnedCopyChecksum=passed, externalCopyRestore=passed, productionReplaced=false, temporaryDatabaseRemoved=true 결과를 확인한다. 실패를 성공으로 기록하지 않는다. PC 원본은 보존한다.

실패 로그는 고정 문구만 출력한다. 키·SQL 데이터·공급자 설정·Docker stderr를 게시하지 않는다. 시험을 통과하더라도 서버가 살아 있어 최신 삭제 이력과 키를 제공한 제한된 복구 훈련이다. 외부 원장의 독립 최신성/키 재해 복구/상시 외부 경보를 검증한 것으로 확대하지 않는다. health.json의 offsiteVerified를 자동으로 true로 바꾸지 않는다. 5.1.4는 복구·경보 전체 완료 전까지 미완료다.

## 개발 검증

오프라인 복원·입력/원본 불변·임시 정리·손상/출처 불일치 거절을 포함한 관련 Node30개와 압축 경로/중복/링크 차단 Python3개를 통과했다. 타입과 worker 번들 빌드를 검증했다. 이 문서 작성 시점에 반환 PC 사본의 서버 실행 성공은 아직 확인하지 않았다. 실제 메일/AI/PG 요청이나 운영 플래그 변경은 없다.
