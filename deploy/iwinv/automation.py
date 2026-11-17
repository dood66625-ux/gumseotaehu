#!/usr/bin/python3
"""Root-owned, forced-command entrypoint for the PRIVATE MOCK server only."""
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

STATE = Path('/var/lib/gumseo-automation')
EXPORT = Path('/var/lib/gumseo-export')
COMPOSE = ['/usr/bin/docker', 'compose', '--env-file', '/etc/gumseo/test.env', '-f', '/usr/local/lib/gumseo/compose.local.yml']
NAMES = {'images.tar.gz', 'compose.local.yml', 'COMMIT', 'SHA256SUMS'}
REVIEW_COMPOSE = Path('/usr/local/lib/gumseo/compose.merchant-review.yml')

def update_review_if_installed():
    if not REVIEW_COMPOSE.exists():
        return
    args = ['/usr/bin/docker', 'compose', '-f', str(REVIEW_COMPOSE)]
    run(args + ['up', '-d', '--no-build', '--force-recreate'], 180)
    for _ in range(30):
        container = run(args + ['ps', '-q', 'review']).decode().strip()
        if container and run(['/usr/bin/docker', 'inspect', '--format', '{{.State.Health.Status}}', container]).decode().strip() == 'healthy':
            proxy = run(args + ['ps', '-q', 'proxy']).decode().strip()
            if proxy and run(['/usr/bin/docker', 'inspect', '--format', '{{.State.Running}}', proxy]).decode().strip() == 'true':
                return
        time.sleep(2)
    raise ValueError('REVIEW_CHECKOUT_HEALTH_FAILED')

def acquire_lock(lock, timeout=240):
    deadline = time.monotonic() + timeout
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise ValueError('AUTOMATION_BUSY_RETRY_LATER') from None
            time.sleep(min(0.1, max(0, deadline - time.monotonic())))

def error_code(error):
    # Never expose command arguments, env values, provider bodies or arbitrary text.
    if isinstance(error, ValueError) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}', str(error)):
        return str(error)
    if isinstance(error, subprocess.CalledProcessError):
        return 'SUBPROCESS_EXIT_' + str(error.returncode)
    if isinstance(error, subprocess.TimeoutExpired):
        return 'SUBPROCESS_TIMEOUT'
    return type(error).__name__

def run(args, timeout=300):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout).stdout

def validate_release(directory):
    directory = Path(directory)
    rows = (directory / 'SHA256SUMS').read_text().splitlines()
    expected = {}
    for row in rows:
        match = re.fullmatch(r'([0-9a-f]{64})  (images\.tar\.gz|compose\.local\.yml|COMMIT)', row)
        if not match or match[2] in expected:
            raise ValueError('INVALID_CHECKSUM_LIST')
        expected[match[2]] = match[1]
    if set(expected) != NAMES - {'SHA256SUMS'}:
        raise ValueError('INCOMPLETE_CHECKSUM_LIST')
    for name, digest in expected.items():
        h = hashlib.sha256()
        with (directory / name).open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                h.update(block)
        if h.hexdigest() != digest:
            raise ValueError('CHECKSUM_MISMATCH')
    commit = (directory / 'COMMIT').read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('INVALID_COMMIT')
    return commit

def extract_release(source, directory):
    # Stream mode: no links, nested paths, duplicate members or unlimited disk writes.
    seen = set()
    total = 0
    with tarfile.open(fileobj=source, mode='r|') as archive:
        for member in archive:
            if member.name not in NAMES or member.name in seen or not member.isfile():
                raise ValueError('UNSAFE_RELEASE_MEMBER')
            limit = 1024 ** 3 if member.name == 'images.tar.gz' else 65536
            if member.size < 0 or member.size > limit:
                raise ValueError('RELEASE_TOO_LARGE')
            total += member.size
            if total > 1024 ** 3 + 196608:
                raise ValueError('RELEASE_TOO_LARGE')
            seen.add(member.name)
            with archive.extractfile(member) as src, (Path(directory) / member.name).open('xb') as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
    if seen != NAMES:
        raise ValueError('INCOMPLETE_RELEASE')
    return validate_release(directory)

def backup():
    # First installed image may not have the bundled command. The one-off worker
    # uses the newly loaded MOCK image and existing data/key; no customer rollout.
    data = run(COMPOSE + ['run', '--rm', '--no-deps', '-T', 'worker', 'node', 'dist/runtime-backup.js'])
    row = json.loads(data.decode().strip().splitlines()[-1])
    if row.get('offlineRestore') != 'passed' or row.get('offsite') is not False:
        raise ValueError('BACKUP_DRILL_FAILED')
    archive = row.get('archive', '')
    checkpoint = row.get('checkpoint', '')
    if not re.fullmatch(r'/data/backups/gumseo-[0-9]+-[0-9a-f-]{36}\.gsb', archive) or not re.fullmatch(r'/data/privacy-checkpoints-[0-9a-f]{16}/latest\.json', checkpoint):
        raise ValueError('INVALID_BACKUP_PATH')
    export = EXPORT
    export.mkdir(mode=0o750, parents=True, exist_ok=True)
    # main's private umask strips group bits at mkdir; the owner must traverse
    # this directory to fetch the explicitly group-readable encrypted export.
    os.chmod(export, 0o750)
    group = grp.getgrnam('gumseo').gr_gid
    os.chown(export, 0, group)
    with tempfile.TemporaryDirectory(prefix='export-', dir=STATE) as directory:
        destination = Path(directory)
        run(COMPOSE + ['cp', 'worker:' + archive, str(destination / 'archive.gsb')])
        run(COMPOSE + ['cp', 'worker:' + checkpoint, str(destination / 'latest.json')])
        manifest = json.loads((destination / 'latest.json').read_text()).get('manifestFile', '')
        if not re.fullmatch(r'deletions-[0-9a-f-]{36}\.json', manifest):
            raise ValueError('INVALID_CHECKPOINT_MANIFEST')
        run(COMPOSE + ['cp', 'worker:' + str(Path(checkpoint).parent / manifest), str(destination / manifest)])
        bundle = destination / 'latest.tar.gz'
        with tarfile.open(bundle, 'w:gz') as tar:
            for name in ('archive.gsb', 'latest.json', manifest):
                tar.add(destination / name, arcname=name, recursive=False)
        staged = export / '.latest.tar.gz.tmp'
        shutil.copyfile(bundle, staged)
        os.chmod(staged, 0o640)
        os.chown(staged, 0, group)
        os.replace(staged, export / 'latest.tar.gz')
        digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
        checksum = export / '.latest.sha256.tmp'
        checksum.write_text(digest + '\n')
        os.chmod(checksum, 0o640)
        os.chown(checksum, 0, group)
        os.replace(checksum, export / 'latest.sha256')
    (STATE / 'backup-status.json').write_text(json.dumps({'at': int(time.time()), 'offlineRestore': 'passed', 'offsite': False}))

def deploy(source):
    with tempfile.TemporaryDirectory(prefix='release-', dir=STATE) as directory:
        commit = extract_release(source, directory)
        # Never accept a changed Docker specification over SSH.
        if (Path(directory) / 'compose.local.yml').read_bytes() != Path(COMPOSE[-1]).read_bytes():
            raise ValueError('COMPOSE_CHANGE_REQUIRES_LOCAL_REVIEW')
        run(['/usr/bin/docker', 'load', '-i', str(Path(directory) / 'images.tar.gz')], 600)
        backup()  # Failure stops deployment. No volume deletion or key replacement.
        try:
            run(COMPOSE + ['up', '-d', '--no-build'], 180)
            for _ in range(40):
                ids = [run(COMPOSE + ['ps', '-q', service]).decode().strip() for service in ('web', 'worker')]
                if all(ids):
                    health = [run(['/usr/bin/docker', 'inspect', '--format', '{{.State.Health.Status}}', item]).decode().strip() for item in ids]
                    if health == ['healthy', 'healthy']:
                        update_review_if_installed()
                        (STATE / 'deployed-commit').write_text(commit + '\n')
                        print('PRIVATE_MOCK_DEPLOYMENT_HEALTHY ' + commit)
                        return
                time.sleep(3)
            raise ValueError('HEALTH_CHECK_FAILED_MANUAL_REVIEW_REQUIRED')
        except Exception:
            (STATE / 'review-required').write_text(commit + '\n')
            raise

def pull():
    if (STATE / 'review-required').exists():
        raise ValueError('AUTOMATIC_UPDATE_PAUSED_FOR_MANUAL_REVIEW')
    request = urllib.request.Request('https://api.github.com/repos/dood66625-ux/gumseotaehu/releases?per_page=20', headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'gumseo-private-mock'})
    with urllib.request.urlopen(request, timeout=30) as response:
        releases = json.loads(response.read(1024 * 1024))
    candidates = [r for r in releases if not r.get('draft') and r.get('prerelease') and re.fullmatch(r'gumseo-mock-[0-9a-f]{40}', r.get('tag_name', ''))]
    if not candidates:
        print('NO_PRIVATE_MOCK_RELEASE_YET')
        return
    latest = max(candidates, key=lambda r: r['id'])
    commit = latest['tag_name'].removeprefix('gumseo-mock-')
    current = STATE / 'deployed-commit'
    if current.exists() and current.read_text().strip() == commit:
        print('PRIVATE_MOCK_ALREADY_CURRENT')
        return
    assets = [a for a in latest.get('assets', []) if a.get('name') == 'mock-release.tar']
    if len(assets) != 1:
        raise ValueError('RELEASE_ASSET_MISSING')
    url = assets[0].get('browser_download_url', '')
    prefix = 'https://github.com/dood66625-ux/gumseotaehu/releases/download/' + latest['tag_name'] + '/'
    if url != prefix + 'mock-release.tar' or not 0 < assets[0]['size'] <= 1024 ** 3 + 1024 ** 2:
        raise ValueError('INVALID_RELEASE_ASSET')
    # Verify the commit inside the archive against the release tag before loading images.
    with urllib.request.urlopen(url, timeout=60) as response, tempfile.TemporaryFile() as downloaded:
        remaining = assets[0]['size']
        while remaining:
            chunk = response.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ValueError('TRUNCATED_RELEASE')
            downloaded.write(chunk)
            remaining -= len(chunk)
        if response.read(1):
            raise ValueError('OVERSIZED_RELEASE')
        downloaded.seek(0)
        with tempfile.TemporaryDirectory(prefix='verify-', dir=STATE) as directory:
            if extract_release(downloaded, directory) != commit:
                raise ValueError('RELEASE_TAG_MISMATCH')
        downloaded.seek(0)
        deploy(downloaded)

def main():
    if len(sys.argv) != 1 or os.geteuid() != 0:
        raise ValueError('ROOT_NO_ARGUMENTS_REQUIRED')
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    if shutil.disk_usage(STATE).free < 2 * 1024 ** 3:
        raise ValueError('DISK_SPACE_LOW_MANUAL_REVIEW_REQUIRED')
    with (STATE / 'lock').open('a') as lock:
        acquire_lock(lock)
        command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
        if command == 'deploy-private-mock':
            deploy(sys.stdin.buffer)
        elif command == 'backup-private-mock':
            backup()
            print('ENCRYPTED_LOCAL_BACKUP_AND_RESTORE_PASSED; OFFSITE_PENDING')
        elif command == 'pull-private-mock':
            pull()
        else:
            raise ValueError('COMMAND_DENIED')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('PRIVATE_AUTOMATION_FAILED [' + error_code(error) + ']: inspect server locally; no automatic DB rollback', file=sys.stderr)
        sys.exit(1)
