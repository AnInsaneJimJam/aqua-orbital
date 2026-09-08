import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from recorded_command import run_recorded


class RecordedCommandTests(unittest.TestCase):
    def test_success_and_failure_keep_exact_output(self):
        with tempfile.TemporaryDirectory(prefix='orbital-command-test-') as directory:
            root = Path(directory)
            for code in [0, 3]:
                result = run_recorded([sys.executable, '-c', f'import sys; print("retained",flush=True); sys.exit({code})'], root, root / 'run.txt', timeout=5)
                self.assertEqual(result['exitStatus'], code)
                self.assertFalse(result['timedOut'])
                self.assertTrue(result['terminal'])
                self.assertEqual((root / 'run.txt').read_text(), 'retained\n')

    def test_timeout_keeps_partial_output_and_stops_owned_descendants(self):
        with tempfile.TemporaryDirectory(prefix='orbital-command-test-') as directory:
            root = Path(directory)
            source = 'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"]); print(p.pid,flush=True); time.sleep(30)'
            result = run_recorded([sys.executable, '-c', source], root, root / 'run.txt', timeout=1)
            output = (root / 'run.txt').read_text()
            self.assertEqual(result['exitStatus'], 124)
            self.assertTrue(result['timedOut'])
            self.assertTrue(result['terminal'])
            child = int(output.splitlines()[0])
            self.assertIn('RECORDED_COMMAND_TIMEOUT', output)
            if os.name == 'nt':
                status = subprocess.run(['powershell', '-NoProfile', '-Command', f'if (Get-CimInstance Win32_Process -Filter "ProcessId = {child}") {{ exit 1 }}'], creationflags=subprocess.CREATE_NO_WINDOW)
                self.assertEqual(status.returncode, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
