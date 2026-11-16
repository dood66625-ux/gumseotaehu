# 비공개 서버 장애 감지

실제 메일·외부 알림 서비스·고객정보 전송 없이 동작한다.

- 서버의 `gumseo-private-monitor.timer`가 5분마다 웹/worker Docker health, 2GB 미만 디스크 여유, 8시간 초과/누락/미래 시각인 로컬 백업, 마지막 업데이트 실패, 수동 검토 대기 표시를 확인한다.
- 상태는 고객 데이터·키·원시 로그 없이 `/var/lib/gumseo-export/health.json`에 원자적으로 저장한다. root 소유, gumseo 그룹 읽기만 허용한다.
- 서버 자체가 중단되면 상태 파일이 갱신되지 않으므로 Windows 검사에서 전송 실패/15분 초과를 이상으로 처리한다.
- `check-health.ps1`는 Windows SSH agent의 기존 키로 파일을 받아 검사하고 고정된 로컬 메시지만 표시한다. `-Notify`일 때 최대 6시간에 한 번 경고 창을 띄우며 정상→이상 전환에는 바로 알린다. 검사 상태는 `GumseoTools/monitor-state.json`에 남긴다.
- 같은 폴더에 이 스크립트가 있으면 `install-backup-task.ps1`가 기존 백업 작업 외에 15분마다 `GumseoHealthMonitor` 사용자 작업을 등록한다. 로그인과 키 인증이 필요하다. 컴퓨터가 꺼진 상태의 상시 알림을 보장하지 않는다.
- 외부 백업 검증은 서버 상태의 `offsiteVerified`로 주장하지 않는다. PC의 실제 예약 실행·체크섬 일치 기록으로 별도 판단한다.

서버 설치는 기존 `sudo bash deploy/iwinv/install.sh`를 다시 실행한다. 원본 코드 수정만으로 이미 설치된 root 소유 helper/서비스 파일이 바뀌지는 않는다.

검증: Python 자동화 12개+상태 판정 4개, Bash 문법 검사 통과. Windows 예약/팝업과 실제 서버 monitor 타이머는 사용자 환경에서 설치·검증해야 한다. 고객용 상시 알림과 운영 장애 대응 체계는 별도 출시 조건이다.
