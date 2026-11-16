#!/usr/bin/python3
"""Rotate only stopped Toss sandbox admin credentials; never print secrets."""
import fcntl
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import tempfile

TARGET = Path('/etc/gumseo/toss-sandbox.env')

def rotate(target=TARGET):
    target = Path(target)
    descriptor = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_nlink != 1 or info.st_size > 16384:
            raise ValueError('PRIVATE_OWNED_FILE_REQUIRED')
        with os.fdopen(descriptor, 'r', closefd=False) as source:
            text = source.read()
    finally:
        os.close(descriptor)
    rows = text.splitlines()
    if any('=' not in row for row in rows):
        raise ValueError('INVALID_CONFIG')
    values = dict(row.split('=', 1) for row in rows)
    if len(values) != len(rows) or values.get('APP_MODE') != 'local' or values.get('EXTERNAL_EFFECTS') != 'disabled' or not re.fullmatch(r'test_gsk_[A-Za-z0-9_]{1,480}', values.get('TOSS_TEST_SECRET_KEY', '')):
        raise ValueError('TEST_SANDBOX_CONFIG_REQUIRED')
    for name, size in [('ADMIN_PASSWORD', 24), ('ADMIN_TOTP_SECRET', 20), ('AUTH_SECRET', 32)]:
        if name not in values:
            raise ValueError('INCOMPLETE_CONFIG')
        values[name] = secrets.token_hex(size)
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix='.test-admin-', dir=target.parent)
        with os.fdopen(fd, 'w') as output:
            output.write(''.join(key + '=' + value + '\n' for key, value in values.items()))
            output.flush()
            os.fsync(output.fileno())
        current = os.stat(target, follow_symlinks=False)
        if current.st_ino != info.st_ino or current.st_mtime_ns != info.st_mtime_ns or current.st_size != info.st_size:
            raise ValueError('CONFIG_CHANGED_DURING_ROTATION')
        os.replace(temporary, target)
        temporary = None
        directory = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if temporary is not None:
            os.unlink(temporary)

if __name__ == '__main__':
    try:
        check = subprocess.run(['sudo', '-n', 'docker', 'ps', '-q', '--filter', 'name=^/gumseo-toss-sandbox-1$'], check=True, capture_output=True, timeout=15)
        if check.stdout.strip():
            raise ValueError('STOP_TEST_SANDBOX_FIRST')
        lock = os.open(TARGET.parent / '.test-admin-rotation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            rotate()
        finally: os.close(lock)
        print('TEST_ADMIN_ROTATED; data encryption key and Toss keys preserved; sandbox remains stopped')
    except Exception:
        print('TEST_ADMIN_ROTATION_FAILED; verify stopped sandbox and private config locally; values suppressed')
        raise SystemExit(1)
