"""Run owned verification children with streamed transcripts and bounded cleanup."""
import os
import signal
import subprocess
from pathlib import Path


def run_recorded(command, cwd: Path, path: Path, timeout=600):
    path.parent.mkdir(parents=True, exist_ok=True)
    timed_out = False
    cleanup = None
    with path.open('wb') as transcript:
        process = subprocess.Popen(command, cwd=cwd, stdout=transcript, stderr=subprocess.STDOUT,
                                   start_new_session=os.name != 'nt',
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            status = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            # The PID is the still-live child created above. Kill only that
            # owned process tree; do not search for or stop unrelated runtimes.
            if process.poll() is None:
                if os.name == 'nt':
                    stopped = subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15,
                                             creationflags=subprocess.CREATE_NO_WINDOW)
                    cleanup = {'exitStatus': stopped.returncode, 'output': stopped.stdout.decode(errors='replace')}
                else:
                    os.killpg(process.pid, signal.SIGKILL)
                    cleanup = {'signal': 'SIGKILL', 'group': process.pid}
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                cleanup = {'incomplete': True, 'ownedPid': process.pid, 'attempt': cleanup}
            status = 124
            transcript.write(f'\nRECORDED_COMMAND_TIMEOUT after {timeout} seconds; owned PID {process.pid}\n'.encode())
    return {'exitStatus': status, 'timedOut': timed_out, 'ownedPid': process.pid,
            'cleanup': cleanup, 'terminal': process.poll() is not None}
