import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('automation', Path(__file__).parents[1] / 'deploy/iwinv/automation.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

def release(compose=b'mock compose', tamper=False):
    files = {'COMMIT': b'a' * 40 + b'\n', 'compose.local.yml': compose, 'images.tar.gz': b'mock images'}
    files['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in files.items()).encode()
    if tamper:
        files['images.tar.gz'] = b'tampered'
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for name, data in files.items():
            item = tarfile.TarInfo(name)
            item.size = len(data)
            archive.addfile(item, io.BytesIO(data))
    output.seek(0)
    return output

class AutomationTests(unittest.TestCase):
    def test_reader_is_not_started_without_install_or_running_container(self):
        with tempfile.TemporaryDirectory() as directory:
            compose = Path(directory)/'reader.yml'
            with patch.object(a, 'PRIVATE_READER_COMPOSE', compose), patch.object(a, 'run') as run:
                a.update_private_reader_if_running()
                run.assert_not_called()
            compose.write_text('installed')
            with patch.object(a, 'PRIVATE_READER_COMPOSE', compose), patch.object(a, 'run', return_value=b'') as run:
                a.update_private_reader_if_running()
                self.assertFalse(any('up' in call.args[0] for call in run.call_args_list))

    def test_reader_refresh_only_when_image_changes_and_preserves_pause(self):
        with tempfile.TemporaryDirectory() as directory:
            compose = Path(directory)/'reader.yml'; compose.write_text('installed')
            for status, current, should_update in [('paused', 'old', False), ('running', 'new', False), ('running', 'old', True)]:
                calls = []
                def run(args, *rest):
                    calls.append(args)
                    if 'ps' in args: return b'reader-container'
                    if '{{.State.Status}}' in args: return status.encode()
                    if '{{.Image}}' in args: return current.encode()
                    if '{{.Id}}' in args: return b'new'
                    if '{{.State.Health.Status}}' in args: return b'healthy'
                    return b''
                with patch.object(a, 'PRIVATE_READER_COMPOSE', compose), patch.object(a, 'run', side_effect=run):
                    a.update_private_reader_if_running()
                ups = [args for args in calls if 'up' in args]
                self.assertEqual(len(ups), 1 if should_update else 0)
                if ups:
                    self.assertEqual(ups[0][-1], 'reader')
                    self.assertIn('--no-deps', ups[0])
                    self.assertIn('--no-build', ups[0])
                    self.assertNotIn('down', ups[0])

    def test_reader_failure_blocks_successful_deployment_record(self):
        def run(args, *rest):
            if 'ps' in args: return b'container\n'
            if 'inspect' in args: return b'healthy\n'
            return b''
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run', side_effect=run), patch.object(a, 'backup'), patch.object(a, 'update_review_if_installed'), patch.object(a, 'update_private_reader_if_running', side_effect=ValueError('PRIVATE_READER_HEALTH_FAILED')):
            with self.assertRaisesRegex(ValueError, 'PRIVATE_READER_HEALTH_FAILED'):
                a.deploy(release())
            self.assertFalse((Path(directory)/'deployed-commit').exists())
            self.assertTrue((Path(directory)/'review-required').exists())

    def test_review_rollout_is_not_enabled_without_local_installation(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(a, 'REVIEW_COMPOSE', Path(directory)/'not-installed.yml'), patch.object(a, 'run') as run:
            a.update_review_if_installed()
            run.assert_not_called()

    def test_review_update_keeps_public_proxy_running(self):
        calls = []
        def run(args, *rest):
            calls.append(args)
            if 'ps' in args: return b'container\n'
            if 'inspect' in args:
                return b'healthy\n' if 'Health.Status' in ' '.join(args) else b'true\n'
            return b''
        with tempfile.TemporaryDirectory() as directory:
            installed = Path(directory) / 'review.yml'
            installed.write_text('installed')
            with patch.object(a, 'REVIEW_COMPOSE', installed), patch.object(a, 'run', side_effect=run):
                a.update_review_if_installed()
        mutations = [args for args in calls if 'run' in args or 'up' in args]
        self.assertEqual(len(mutations), 2)
        self.assertEqual(mutations[0][-1], 'assets')
        self.assertEqual(mutations[1][-1], 'review')
        self.assertTrue(all('--no-deps' in args for args in mutations))
        self.assertFalse(any('--force-recreate' in args or 'proxy' in args for args in mutations))

    def test_review_failure_does_not_record_successful_main_rollout(self):
        def run(args, *rest):
            if 'ps' in args: return b'container\n'
            if 'inspect' in args: return b'healthy\n'
            return b''
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run', side_effect=run), patch.object(a, 'backup'), patch.object(a, 'update_review_if_installed', side_effect=ValueError('REVIEW_CHECKOUT_HEALTH_FAILED')):
            with self.assertRaises(ValueError): a.deploy(release())
            self.assertFalse((Path(directory)/'deployed-commit').exists())
            self.assertTrue((Path(directory)/'review-required').exists())
    def test_current_release_reconciles_reader_without_downloading_images(self):
        metadata = json.dumps([{'id': 1, 'draft': False, 'prerelease': True, 'tag_name': 'gumseo-mock-' + 'a'*40}]).encode()
        with tempfile.TemporaryDirectory() as directory, patch.object(a, 'STATE', Path(directory)), patch.object(a.urllib.request, 'urlopen', return_value=io.BytesIO(metadata)) as request, patch.object(a, 'update_private_reader_if_running') as refresh:
            (Path(directory)/'deployed-commit').write_text('a'*40)
            a.pull()
            refresh.assert_called_once()
            self.assertEqual(request.call_count, 1)

    def test_reader_reconcile_failure_pauses_later_checks(self):
        metadata = json.dumps([{'id': 1, 'draft': False, 'prerelease': True, 'tag_name': 'gumseo-mock-' + 'a'*40}]).encode()
        with tempfile.TemporaryDirectory() as directory, patch.object(a, 'STATE', Path(directory)), patch.object(a.urllib.request, 'urlopen', return_value=io.BytesIO(metadata)), patch.object(a, 'update_private_reader_if_running', side_effect=ValueError('PRIVATE_READER_HEALTH_FAILED')) as refresh:
            (Path(directory)/'deployed-commit').write_text('a'*40)
            with self.assertRaisesRegex(ValueError, 'PRIVATE_READER_HEALTH_FAILED'): a.pull()
            self.assertTrue((Path(directory)/'review-required').exists())
            with self.assertRaisesRegex(ValueError, 'AUTOMATIC_UPDATE_PAUSED_FOR_MANUAL_REVIEW'): a.pull()
            refresh.assert_called_once()

    def test_busy_lock_retries_then_acquires(self):
        with patch.object(a.fcntl, 'flock', side_effect=[BlockingIOError(), None]) as lock, patch.object(a.time, 'sleep'):
            a.acquire_lock(None)
            self.assertEqual(lock.call_count, 2)

    def test_busy_lock_timeout_has_safe_error(self):
        with patch.object(a.fcntl, 'flock', side_effect=BlockingIOError()):
            with self.assertRaisesRegex(ValueError, 'AUTOMATION_BUSY_RETRY_LATER'):
                a.acquire_lock(None, timeout=0)

    def test_error_diagnostics_do_not_leak_arguments(self):
        error = a.subprocess.CalledProcessError(1, ['secret-command'], stderr=b'private key')
        self.assertEqual(a.error_code(error), 'SUBPROCESS_EXIT_1')
        self.assertEqual(a.error_code(ValueError('a private value')), 'ValueError')

    def test_valid_release(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(a.extract_release(release(), directory), 'a' * 40)

    def test_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'CHECKSUM_MISMATCH'):
                a.extract_release(release(tamper=True), directory)

    def test_traversal_and_links_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('images.tar.gz', tarfile.SYMTYPE)]:
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w') as archive:
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = '/etc/shadow'
                archive.addfile(item)
            output.seek(0)
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError, 'UNSAFE_RELEASE_MEMBER'):
                    a.extract_release(output, directory)

    def deploy_fixture(self, directory):
        root = Path(directory)
        compose = root / 'compose.yml'
        compose.write_bytes(b'mock compose')
        return patch.multiple(a, STATE=root, COMPOSE=['docker', 'compose', '-f', str(compose)])

    def test_backup_failure_blocks_up(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run', side_effect=lambda args, *rest: calls.append(args) or b''), patch.object(a, 'backup', side_effect=ValueError('backup failed')):
            with self.assertRaises(ValueError):
                a.deploy(release())
            self.assertFalse(any('up' in c for c in calls))
            self.assertFalse((Path(directory) / 'deployed-commit').exists())

    def test_health_required_before_recording_commit(self):
        def run(args, *rest):
            if 'ps' in args:
                return b'container\n'
            if 'inspect' in args:
                return b'healthy\n'
            return b''
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run', side_effect=run), patch.object(a, 'backup') as backup:
            a.deploy(release())
            backup.assert_called_once()
            self.assertEqual((Path(directory) / 'deployed-commit').read_text().strip(), 'a' * 40)

    def test_unhealthy_not_recorded(self):
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run', return_value=b''), patch.object(a, 'backup'), patch.object(a.time, 'sleep'):
            with self.assertRaisesRegex(ValueError, 'HEALTH_CHECK_FAILED'):
                a.deploy(release())
            self.assertFalse((Path(directory) / 'deployed-commit').exists())

    def test_changed_compose_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as directory, self.deploy_fixture(directory), patch.object(a, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'COMPOSE_CHANGE'):
                a.deploy(release(b'privileged compose'))
            run.assert_not_called()

    def test_backup_rejects_unexpected_paths(self):
        row = {'offlineRestore': 'passed', 'offsite': False, 'archive': '/etc/gumseo/test.env', 'checkpoint': '/etc/shadow'}
        with patch.object(a, 'run', return_value=json.dumps(row).encode()):
            with self.assertRaisesRegex(ValueError, 'INVALID_BACKUP_PATH'):
                a.backup()

    def test_backup_export_contains_no_key_file(self):
        archive = '/data/backups/gumseo-123-' + 'a' * 36 + '.gsb'
        checkpoint = '/data/privacy-checkpoints-' + 'a' * 16 + '/latest.json'
        manifest = 'deletions-' + 'b' * 36 + '.json'
        def run(args, *rest):
            if 'run' in args:
                return json.dumps({'offlineRestore': 'passed', 'offsite': False, 'archive': archive, 'checkpoint': checkpoint}).encode()
            target = Path(args[-1])
            target.write_bytes(json.dumps({'manifestFile': manifest}).encode() if target.name == 'latest.json' else b'encrypted fixture')
            return b''
        with tempfile.TemporaryDirectory() as directory, patch.multiple(a, STATE=Path(directory), EXPORT=Path(directory) / 'export'), patch.object(a, 'run', side_effect=run), patch.object(a.os, 'chown'), patch.object(a.grp, 'getgrnam') as group:
            group.return_value.gr_gid = 1000
            a.backup()
            bundle = Path(directory) / 'export/latest.tar.gz'
            self.assertEqual(bundle.parent.stat().st_mode & 0o777, 0o750)
            with tarfile.open(bundle) as exported:
                self.assertEqual(set(exported.getnames()), {'archive.gsb', 'latest.json', manifest})
            expected = hashlib.sha256(bundle.read_bytes()).hexdigest()
            self.assertEqual((bundle.parent / 'latest.sha256').read_text().strip(), expected)

if __name__ == '__main__':
    unittest.main()
