#!/usr/bin/python3
"""Run interactively on the owner's server. Never print or accept live keys."""
import getpass
import os
from pathlib import Path
import re
import secrets
import sys

TARGET = Path('/etc/gumseo/toss-sandbox.env')

def validate(client, secret):
    if not re.fullmatch(r'test_gck_[A-Za-z0-9_]{1,480}', client):
        raise ValueError('TEST_WIDGET_CLIENT_KEY_REQUIRED')
    if not re.fullmatch(r'test_gsk_[A-Za-z0-9_]{1,480}', secret):
        raise ValueError('TEST_WIDGET_SECRET_KEY_REQUIRED')

def write_config(client, secret, target=TARGET):
    validate(client, secret)
    # O_EXCL prevents regeneration of keys protecting existing sandbox data.
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as file:
        values = {'APP_MODE': 'local', 'EXTERNAL_EFFECTS': 'disabled', 'DATA_KEY': secrets.token_hex(32), 'AUTH_SECRET': secrets.token_hex(32), 'ADMIN_PASSWORD': secrets.token_hex(24), 'ADMIN_TOTP_SECRET': secrets.token_hex(20), 'TOSS_TEST_CLIENT_KEY': client, 'TOSS_TEST_SECRET_KEY': secret, 'TOSS_TEST_MID': 'q_gdood65qf7'}
        for key, value in values.items():
            file.write(key + '=' + value + '\n')

if __name__ == '__main__':
    try:
        if not sys.stdin.isatty():
            raise ValueError('INTERACTIVE_TERMINAL_REQUIRED')
        if TARGET.exists():
            raise ValueError('SANDBOX_CONFIG_ALREADY_EXISTS')
        client = getpass.getpass('Toss TEST widget client key (hidden): ').strip()
        secret = getpass.getpass('Toss TEST widget secret key (hidden): ').strip()
        write_config(client, secret)
        print('Separate test configuration created. Shape checked only; merchant pairing is not yet verified.')
    except Exception:
        print('SETUP_FAILED: use test widget keys only; existing settings are never overwritten; values suppressed.')
        raise SystemExit(1)
