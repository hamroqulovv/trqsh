"""Local archive smoke tests; no release/network/account is used."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


class ShellInstallerTests(unittest.TestCase):
    def test_install_and_failed_checksum_preserve_binary(self):
        bash = shutil.which("bash")
        if os.name == "nt":
            bash = r"C:\Program Files\Git\bin\bash.exe"
        if not bash or not Path(bash).exists():
            self.skipTest("bash unavailable")
        with tempfile.TemporaryDirectory(prefix="trqsh-shell-test-") as directory:
            root = Path(directory)
            tools = root / "tools"
            tools.mkdir()
            # An inert shell binary lets this test exercise installer behavior
            # on any host without needing a native Linux release binary.
            uname = tools / "uname"
            uname.write_text('#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n')
            uname.chmod(0o755)
            archive = root / "trqsh_1.2.3_linux_amd64.tar.gz"
            with tarfile.open(archive, "w:gz") as tf:
                content = b"#!/bin/sh\nprintf 'trqsh 1.2.3\\n'\n"
                member = tarfile.TarInfo("trqsh")
                member.size, member.mode = len(content), 0o755
                tf.addfile(member, io.BytesIO(content))
            sums = root / "checksums.txt"
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            sums.write_text(f"{digest}  {archive.name}\n")
            target = root / "installed"
            env = {**os.environ, "TRQSH_VERSION": "1.2.3",
                   "TRQSH_BINDIR": target.as_posix(),
                   "TRQSH_DOWNLOAD_BASE": root.as_uri(),
                   "TRQSH_SKIP_CHECKSUM": "0"}
            # Set PATH inside bash to avoid Windows drive delimiters.
            env["TEST_TOOLS"] = tools.as_posix()
            script = Path(__file__).parent / "install.sh"
            command = [bash, "-c", 'test_tools=$(cd "$TEST_TOOLS" && pwd); export PATH="$test_tools:$PATH"; exec sh "$1"', "test", script.resolve().as_posix()]
            good = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertIn("Verified  SHA-256", good.stderr)
            self.assertIn("Run: trqsh", good.stderr)
            before = (target / "trqsh").read_bytes()
            for checksum in ("0" * 64 + f"  {archive.name}\n", f"{digest}  wrong.tar.gz\n"):
                sums.write_text(checksum)
                bad = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30)
                self.assertNotEqual(bad.returncode, 0)
                self.assertNotIn("Installed successfully", bad.stderr)
                self.assertEqual((target / "trqsh").read_bytes(), before)
            self.assertEqual(list(target.iterdir()), [target / "trqsh"])


if __name__ == "__main__":
    unittest.main()
