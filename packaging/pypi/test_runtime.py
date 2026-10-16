import hashlib
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / "src"))
from trqsh import _runtime as runtime


class InstallTests(unittest.TestCase):
    def test_checksum_required(self):
        with patch.dict(os.environ, {"TRQSH_SKIP_CHECKSUM": "0"}):
            with patch.object(runtime, "_download", side_effect=OSError("offline")):
                with self.assertRaises(OSError):
                    runtime._verify(b"data", "a.zip", "http://fixture")
            with patch.object(runtime, "_download", return_value=b"hash  other.zip"):
                with self.assertRaises(OSError):
                    runtime._verify(b"data", "a.zip", "http://fixture")
            digest = hashlib.sha256(b"data").hexdigest()
            with patch.object(runtime, "_download", return_value=f"{digest}  a.zip".encode()):
                runtime._verify(b"data", "a.zip", "http://fixture")
                with self.assertRaises(SystemExit):
                    runtime._verify(b"wrong", "a.zip", "http://fixture")

    def test_atomic_install_and_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / runtime._bin_name()
            target.write_bytes(b"previous")
            def extract(archive, ext, dest):
                (dest / target.name).write_bytes(b"new")
            def version(file):
                return runtime.VERSION if file.read_bytes() == b"new" else None
            with patch.object(runtime, "bin_path", return_value=target), \
                 patch.object(runtime, "_ensure_on_path"), \
                 patch.object(runtime, "_download", return_value=b"archive"), \
                 patch.object(runtime, "_verify"), \
                 patch.object(runtime, "_binary_version", side_effect=version), \
                 patch.object(runtime, "_extract", side_effect=OSError("corrupt")):
                with self.assertRaises(OSError):
                    runtime.ensure_binary()
                self.assertEqual(target.read_bytes(), b"previous")
                self.assertEqual(list(Path(directory).iterdir()), [target])
                with patch.object(runtime, "_extract", side_effect=extract):
                    runtime.ensure_binary()
                self.assertEqual(target.read_bytes(), b"new")
                self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_plain_ui(self):
        from trqsh._ui import InstallUI
        with patch("sys.stderr", new_callable=io.StringIO) as out:
            ui = InstallUI()
            ui.title("1.2.3", "linux / amd64")
            ui.progress(10, 20)
            ui.step("Ready", "/tmp/trqsh")
            self.assertIn("trqsh / install", out.getvalue())
            self.assertNotIn("\x1b", out.getvalue())
            self.assertNotIn("\r", out.getvalue())

    def test_cached_versions_and_explicit_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / runtime._bin_name()
            target.write_bytes(b"0.2.1")
            def extract(archive, ext, dest):
                (dest / target.name).write_bytes(runtime.VERSION.encode())
            with patch.dict(os.environ, {"TRQSH_VERSION": ""}), \
                 patch.object(runtime, "bin_path", return_value=target), \
                 patch.object(runtime, "_ensure_on_path"), \
                 patch.object(runtime, "_download", return_value=b"archive") as download, \
                 patch.object(runtime, "_verify"), \
                 patch.object(runtime, "_binary_version", side_effect=lambda p: p.read_text()), \
                 patch.object(runtime, "_extract", side_effect=extract):
                runtime.ensure_binary()
                self.assertEqual(target.read_text(), runtime.VERSION)
                self.assertEqual(download.call_count, 1)
                target.write_text("99.0.0")
                runtime.ensure_binary()
                self.assertEqual(target.read_text(), "99.0.0")
                self.assertEqual(download.call_count, 1, "newer self-update must be retained")
                with patch.dict(os.environ, {"TRQSH_VERSION": runtime.VERSION}):
                    runtime.ensure_binary()
                self.assertEqual(target.read_text(), runtime.VERSION)
                self.assertEqual(download.call_count, 2, "explicit pin must replace a newer version")

    def test_semantic_version_ordering(self):
        for current, required, want in [
            ("0.2.1", "0.2.5", False), ("0.2.10", "0.2.9", True),
            ("0.2.5-beta.10", "0.2.5-beta.2", True), ("0.2.5-beta", "0.2.5", False),
            ("0.2.5", "0.2.5-beta", True), ("0.2.5+build", "0.2.5", True),
            ("0.2.5-1", "0.2.5-beta", False), ("broken", "0.2.5", False),
        ]:
            with self.subTest(current=current, required=required):
                self.assertEqual(runtime._version_key(current) >= runtime._version_key(required), want)


if __name__ == "__main__":
    unittest.main()
