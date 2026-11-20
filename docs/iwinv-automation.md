# 비공개 테스트 서버 자동화

이 구성은 합성 데이터와 모의 결제 전용이다. 실제 운영 사이트·결제·고객 메일·고객 개인정보 외부 전송을 활성화하지 않는다.

## 자동으로 수행하는 일

- main의 앱/실행 코드 변경 시 GitHub에서 타입 검사, 배포 도구 테스트, 앱 빌드, 비밀값 제외 검사 후 이미지를 생성한다.
- 공개 소스 저장소의 prerelease에 **비밀값·DB 없는 코드 이미지**를 게시한다. 고객 백업·서버 키는 GitHub에 게시하지 않는다.
- 새 자동화 설치 후 서버는 5분 간격(최대 15초 지연)으로 해당 저장소의 `gumseo-mock-<40자리 커밋>` 패키지를 확인한다. 커밋/체크섬/파일 목록과 루트 소유 Compose 원본 일치를 검사한다.
- 적용 전에 기존 키/볼륨을 이용해 암호화 백업과 별도 임시 DB 복원 시험을 한다. 최초 구버전에 백업 명령이 없는 경우 새 모의 이미지의 일회성 worker로 수행한다. 실제 운영 DB의 무검토 마이그레이션에 이 절차를 재사용하지 않는다.
- 백업 실패 시 배포를 중지한다. 웹/worker healthy 확인 후에만 적용 커밋을 기록한다. 실패했다고 DB를 자동으로 되돌리지 않는다.
- 6시간마다 암호화 백업/복원 시험을 반복한다. 동시에 실행하지 않는다. 서버 디스크 여유가 2GB 미만이면 작업을 중단한다.
- 실행 포트는 기존처럼 127.0.0.1:3100뿐이다. 루트 소유 자동화 파일은 이후 git pull로 교체되지 않는다.

## 서버에 최초 설치

새 prerelease 빌드 성공을 확인한 뒤 기존 서버 SSH 창에서:

```bash
cd /opt/gumseo/source
git pull --ff-only
sudo bash deploy/iwinv/install.sh
```

설치기는 첫 업데이트가 healthy로 완료돼 커밋 기록이 생긴 경우에만 타이머를 켠다. 새 패키지가 없거나 첫 배포가 실패하면 설치 완료가 아니다.

확인:

```bash
sudo systemctl list-timers --all 'gumseo-private-*'
sudo journalctl -u gumseo-private-update.service -n 20 --no-pager
sudo journalctl -u gumseo-private-backup.service -n 20 --no-pager
```

수동 업데이트: `sudo systemctl start gumseo-private-update.service`

수동 백업: `sudo systemctl start gumseo-private-backup.service`

일시 정지: `sudo systemctl stop gumseo-private-update.timer gumseo-private-backup.timer`

## 사장님 컴퓨터에 외부 사본 보관

서버가 성공적으로 만든 최신 내보내기는 `/var/lib/gumseo-export/latest.tar.gz`와 `latest.sha256`다. 아카이브에는 암호화 DB, 서명된 최신 체크포인트, 암호화 삭제 목록만 포함한다. DATA_KEY는 포함하지 않는다.

Windows에 `pull-backup.ps1`와 `install-backup-task.ps1`를 같은 폴더로 복사한다. `pull-backup.ps1`는 scp로 내려받아 SHA256을 확인한 후에만 성공 파일로 이름을 바꾼다. 실패/중간 파일은 보관 성공으로 표시하지 않는다.

정기 작업 설치는 **기존 키를 ssh-agent에 로드한 상태에서 무인 SSH 인증이 실제 성공할 때만** 가능하다. 개인키 암호를 없애거나 비밀번호를 저장하지 않는다. `install-backup-task.ps1`는 로그인 때와 6시간마다 실행하는 사용자 작업을 등록한다. PC가 꺼져 있거나 로그아웃했거나 키가 로드되지 않았으면 외부 백업이 실행되지 않는다. 작업 등록만으로 외부 보관 완료로 보고하면 안 된다. Windows에서 실제 실행 검증은 별도 필요하다.

DATA_KEY를 포함한 `/etc/gumseo/test.env`는 별도 안전한 보관소에 보존해야 복호화가 가능하다. 키를 대화·GitHub·백업 아카이브에 넣지 않는다. 최신 삭제 체크포인트의 권위 있는 별도 보관, 장기 보관/정리 정책, 저장 공간 경보 및 상시 가동 외부 저장소는 운영 출시 전 남은 작업이다. 오래된 백업의 체크포인트만으로 실제 복원하지 않는다.

## 검증 범위

개발 환경에서 자동화 테스트 9개(손상 파일/경로 탈출/링크 차단, Compose 변경 차단, 백업 실패 시 배포 차단, healthy 후 커밋 기록, 키 제외 내보내기), Bash 문법 및 workflow YAML 구문을 확인했다. 기존 암호화 백업 관련 테스트와 번들 복원 시험도 통과했다. 실제 iwinv 설치/타이머, GitHub release 게시, Windows 예약 작업과 외부 사본은 각각 실측 확인 전 미완료다.

## 매번 SSH 없이 갱신하기 (2026-11-20)

이전 설치 타이머는 1시간 간격이었다. 수동 `systemctl start`는 즉시 확인하려는 경우에만 필요한 것이며 매 배포마다 SSH가 필수인 구조는 아니다. 이번 코드의 `update.timer`는 5분 간격과 최대15초 지연으로 바꿨다. GitHub 검사/패키지 발행 시간과 다운로드·백업·Docker health 확인 시간은 별도다. 같은 release라면 이미지를 다시 받거나 주 앱을 재배포하지 않는다.

비공개 운명서 reader도 root 소유 설치 Compose가 존재하고 **현재 실행 중인 경우만** 새 이미지와 비교한다. 이미지가 같으면 재시작하지 않고, 다르면 reader 한 서비스만 같은 env/볼륨으로 갱신한다. stopped/paused 서비스를 자동으로 시작하지 않는다. reader의 기존 75초 종료 유예와 서버의 진행 요청 종료 처리를 따른다. 신규 키·초대 링크·저장본·예산을 만들거나 실제 AI를 자동 호출하지 않는다. 주 앱이 최신 release여도 예전 이미지의 reader가 남아 있으면 다음 확인에서 맞춘다. 이 경우에도 같은 이미지면 그대로 둔다.

기존 서버에는 설치된 root helper가 git pull만으로 바뀌지 않는다. 현재 열려 있는 SSH 창에서 **한 번만** 다음을 실행한다.

```bash
cd /opt/gumseo/source && git pull --ff-only && sudo bash deploy/iwinv/enable-auto-updates.sh
```

자동화 설정 설치는 관리자 권한이 필요하다. 기존 NOPASSWD 규칙은 서비스 시작 명령만 허용하므로 이 설치 때 한 번은 비밀번호를 요구할 수 있다. 스크립트는 기존 서비스/Compose가 설치돼 있어야 실행하고 배포/백업 잠금이 풀릴 때까지 기다린 뒤 root helper와 update.timer만 설치한다. 키/env/Compose/기존 sudoers를 변경하지 않는다. 단회 업데이트 확인에 성공한 후 타이머를 활성화하고 다음 실행 시각을 표시한다. 권한을 모두 NOPASSWD로 풀거나 클라우드에 비밀번호/SSH 개인키를 저장하지 않는다.

실패한 배포/reader health 확인은 기존 `review-required` 보류를 유지한다. 보류 표시를 자동 삭제하거나 DB를 되돌리지 않는다. 따라서 정상적인 코드·화면 배포는 자동으로 처리하지만 장애/새로운 root 설정/복구에는 운영자 확인이 필요할 수 있다.

검증: Python 배포 테스트19개와 설치기 Bash 구문 검사 통과. 미설치·정지·일시정지 reader 미시작, 동일 이미지 재시작 없음, 변경 이미지의 한 서비스 갱신, reader 실패 후 성공 기록 금지, 같은 release의 reader 재대조/실패 뒤 반복 배포 보류를 모의 명령으로 검증했다. 실제 서버에 새 자동화 설정을 설치하지는 않았다. 현재 클라우드 세션에는 SSH 키/에이전트/배포용 credential이 없으며, 공개 사이트에서 적용 버전만 조회할 수 있다.
