import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('private_setup',Path(__file__).parents[1]/'deploy/iwinv/setup-private-reader.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PrivateSetupTests(unittest.TestCase):
    def fixture(self,temporary):
        root=Path(temporary)/'source';destination=Path(temporary)/'installed'
        (root/'deploy/iwinv').mkdir(parents=True);destination.mkdir()
        (root/'deploy/iwinv/Caddyfile.merchant-review').write_text('new config')
        (destination/'Caddyfile.merchant-review').write_text('old config')
        return root,destination
    def test_invalid_proxy_config_is_rolled_back_without_restarting(self):
        with tempfile.TemporaryDirectory() as directory:
            root,dest=self.fixture(directory)
            with patch.object(m,'run',side_effect=subprocess.CalledProcessError(1,['validate'])) as command:
                with self.assertRaises(ValueError):m.configure_proxy(root,dest)
                self.assertEqual(command.call_count,1)
            self.assertEqual((dest/'Caddyfile.merchant-review').read_text(),'old config')
    def test_disabled_admin_reload_recreates_only_validated_proxy(self):
        with tempfile.TemporaryDirectory() as directory:
            root,dest=self.fixture(directory)
            with patch.object(m,'run',side_effect=[None,subprocess.CalledProcessError(1,['reload']),None]) as command:
                m.configure_proxy(root,dest)
                self.assertIn('--no-deps',command.call_args_list[-1].args[0])
                self.assertEqual(command.call_args_list[-1].args[0][-1],'proxy')
            self.assertEqual((dest/'Caddyfile.merchant-review').read_text(),'new config')
    def test_key_loader_refuses_symbolic_links(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'target';target.write_text('OPENAI_API_KEY=sk-offline_test_012345678901234567890')
            link=Path(directory)/'link';link.symlink_to(target)
            with self.assertRaises(ValueError):m.existing_key([link])

    def test_unchanged_proxy_config_does_not_restart_the_existing_site(self):
        with tempfile.TemporaryDirectory() as directory:
            root,dest=self.fixture(directory)
            (root/'deploy/iwinv/Caddyfile.merchant-review').write_text('old config')
            with patch.object(m,'run') as command:
                m.configure_proxy(root,dest)
                command.assert_not_called()
