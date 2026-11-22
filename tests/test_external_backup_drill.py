import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('external_drill', Path(__file__).parents[1] / 'deploy/iwinv/verify-external-backup.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MANIFEST = 'deletions-11111111-1111-4111-8111-111111111111.json'

class BundleParsing(unittest.TestCase):
    def bundle(self, root, extra=None):
        bundle = root / 'input.tar.gz'
        entries = [('archive.gsb', b'fixture-encrypted-archive'), ('latest.json', json.dumps({'manifestFile': MANIFEST}).encode()), (MANIFEST, b'fixture-signed-deletions')]
        if extra is not None:
            entries = [extra] + entries
        with tarfile.open(bundle, 'w:gz') as tar:
            for name, content in entries:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
        return bundle

    def test_allows_only_the_expected_three_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); output=root/'output';output.mkdir()
            module.unpack(self.bundle(root),output)
            self.assertEqual({p.name for p in output.iterdir()}, {'archive.gsb','latest.json',MANIFEST})
            self.assertEqual((output/'archive.gsb').stat().st_mode & 0o777,0o600)

    def test_rejects_traversal_unexpected_files_and_duplicates(self):
        for name in ('../outside','/absolute','extra.txt','archive.gsb'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                root=Path(temp); output=root/'output';output.mkdir()
                with self.assertRaises(ValueError): module.unpack(self.bundle(root,(name,b'x')),output)
                self.assertFalse((root/'outside').exists())

    def test_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); output=root/'output';output.mkdir();bundle=root/'input.tar.gz'
            with tarfile.open(bundle,'w:gz') as tar:
                info=tarfile.TarInfo('archive.gsb');info.type=tarfile.SYMTYPE;info.linkname='/etc/passwd';tar.addfile(info)
            with self.assertRaises(ValueError): module.unpack(bundle,output)

if __name__ == '__main__': unittest.main()
