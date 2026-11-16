import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).parents[1] / 'deploy/iwinv/monitor.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class MonitorTests(unittest.TestCase):
    def evaluate(self, **changes):
        args = dict(now=100000, health={'web': 'healthy', 'worker': 'healthy'}, free=3 * 1024 ** 3, backup_at=99000, update_failed=False, review=False)
        args.update(changes)
        return m.evaluate(**args)

    def test_healthy_does_not_claim_offsite_verification(self):
        row = self.evaluate()
        self.assertTrue(row['healthy'])
        self.assertFalse(row['offsiteVerified'])

    def test_dead_worker_detected_even_if_web_works(self):
        self.assertIn('WORKER_UNHEALTHY', self.evaluate(health={'web': 'healthy', 'worker': 'unknown'})['issues'])

    def test_stale_and_missing_and_future_backup_detected(self):
        for value in (None, 1, 100031):
            self.assertIn('LOCAL_BACKUP_MISSING_OR_STALE', self.evaluate(backup_at=value)['issues'])

    def test_disk_and_rollout_failures_detected(self):
        row = self.evaluate(free=0, update_failed=True, review=True)
        self.assertEqual(set(row['issues']), {'DISK_SPACE_LOW', 'UPDATE_LAST_RUN_FAILED', 'UPDATE_PAUSED_FOR_REVIEW'})
