#!/usr/bin/env bash
# Compatibility entry point: current login uses a personally chosen password, no OTP.
set -euo pipefail
printf '%s\n' '현재 관리자는 비밀번호만으로 로그인합니다.' '직접 설정·분실 복구: sudo bash deploy/iwinv/set-admin-password.sh'
