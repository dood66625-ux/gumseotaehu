#!/usr/bin/env python3
"""One-off owner-run offline drill. Never mounts live data or prints environment/key values."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

MAX_ARCHIVE = 64 * 1024 * 1024 + 32

def unpack(bundle, destination):
    """Do not trust tar paths, owners, links, member counts or declared sizes."""
    seen = set()
    with tarfile.open(bundle, 'r:gz') as tar:
        for member in tar:
            name = member.name
            limit = (MAX_ARCHIVE if name == 'archive.gsb' else 4096 if name == 'latest.json'
                     else 16 * 1024 * 1024 if re.fullmatch(r'deletions-[a-f0-9-]{36}\.json', name) else 0)
            if not limit or name in seen or not member.isfile() or member.size > limit or member.size < 1 or len(seen) >= 3:
                raise ValueError('UNSAFE_BACKUP_BUNDLE')
            source = tar.extractfile(member)
            if source is None:
                raise ValueError('INVALID_BACKUP_MEMBER')
            with source, open(destination / name, 'xb') as target:
                remaining = member.size
                while remaining:
                    part = source.read(min(1024 * 1024, remaining))
                    if not part:
                        raise ValueError('TRUNCATED_BACKUP_MEMBER')
                    target.write(part)
                    remaining -= len(part)
            os.chmod(destination / name, 0o600)
            seen.add(name)
    if len(seen) != 3 or not {'archive.gsb', 'latest.json'}.issubset(seen):
        raise ValueError('INCOMPLETE_BACKUP_BUNDLE')
    receipt = json.loads((destination / 'latest.json').read_text())
    if receipt.get('manifestFile') not in seen - {'archive.gsb', 'latest.json'}:
        raise ValueError('BACKUP_MANIFEST_MISMATCH')


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise ValueError('RUN_AS_ROOT_WITHOUT_ARGUMENTS')
    incoming = Path('/home/gumseo/gumseo-restore-input')
    bundle, checksum = incoming / 'latest.tar.gz', incoming / 'latest.sha256'
    if incoming.is_symlink() or incoming.resolve() != incoming or incoming.stat().st_mode & 0o077:
        raise ValueError('PRIVATE_INPUT_DIRECTORY_REQUIRED')
    for file in (bundle, checksum):
        if file.is_symlink() or not file.is_file() or file.stat().st_nlink != 1:
            raise ValueError('REGULAR_INPUT_FILE_REQUIRED')
    if bundle.stat().st_size > 100 * 1024 * 1024 or checksum.stat().st_size > 128:
        raise ValueError('BACKUP_INPUT_TOO_LARGE')
    expected = checksum.read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{64}', expected) or hashlib.sha256(bundle.read_bytes()).hexdigest() != expected:
        raise ValueError('RETURNED_COPY_CHECKSUM_MISMATCH')
    with tempfile.TemporaryDirectory(prefix='gumseo-returned-backup-') as directory:
        root = Path(directory)
        old, current = root / 'returned', root / 'current'
        old.mkdir(mode=0o700)
        current.mkdir(mode=0o700)
        # Copy through strict parsing; current server checkpoint, not the old archive's checkpoint, is authoritative here.
        unpack(bundle, old)
        unpack(Path('/var/lib/gumseo-export/latest.tar.gz'), current)
        for item in root.rglob('*'):
            os.chown(item, 1000, 1000)
        os.chown(root, 1000, 1000)
        command = [
            '/usr/bin/docker', 'run', '--rm', '--network', 'none', '--read-only',
            '--user', '1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
            '--env-file', '/etc/gumseo/test.env',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=192m,uid=1000,gid=1000,mode=0700',
            '--mount', f'type=bind,src={root},dst=/restore-input,readonly',
            '--workdir', '/app', 'gumseo-local-worker:local', 'node', 'dist/runtime-backup.js',
            '--verify-external', '/restore-input/returned/archive.gsb', '/restore-input/current/latest.json',
        ]
        result = subprocess.run(command, capture_output=True, timeout=180)
        if result.returncode:
            raise ValueError('OFFLINE_RETURNED_COPY_RESTORE_FAILED')
        row = json.loads(result.stdout.decode().strip().splitlines()[-1])
        if row.get('externalCopyRestore') != 'passed' or row.get('productionReplaced') is not False:
            raise ValueError('RESTORE_PROOF_INVALID')
        print(json.dumps({'returnedCopyChecksum': 'passed', **row, 'liveDatabaseMounted': False,
                          'networkEnabled': False, 'externalStoreFreshnessVerified': False,
                          'continuousAlertingVerified': False}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('EXTERNAL_RESTORE_DRILL_FAILED; no live replacement; private details suppressed', file=sys.stderr)
        sys.exit(1)
