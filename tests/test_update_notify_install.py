import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('notify_installer',Path(__file__).parents[1]/'deploy/iwinv/install-publish-notify.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
class NotifyInstallTests(unittest.TestCase):
    def test_proxy_patch_preserves_reader_and_is_idempotent(self):
        old=(Path(__file__).parents[1]/'deploy/iwinv/Caddyfile.merchant-review').read_text()
        new=n.with_notify_route(old)
        self.assertIn('reverse_proxy @publish_notify 127.0.0.1:3461',new)
        self.assertEqual(new.split('pay.gumseo.kr {',1)[1],old.split('pay.gumseo.kr {',1)[1])
        self.assertEqual(n.with_notify_route(new),new)
    def test_foreign_or_conflicting_proxy_is_not_overwritten(self):
        for old in ['other.kr {\n}\n','gumseo.kr {\n/_internal/update-notify\n}\n','gumseo.kr {\n'+n.BEGIN+'\n}']:
            with self.assertRaises(ValueError):n.with_notify_route(old)
if __name__=='__main__':unittest.main()
