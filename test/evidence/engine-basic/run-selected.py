"""Run the eight selected checks; reject empty or different test discovery.

Usage: python test/evidence/engine-basic/run-selected.py <computation-audit skill>
The earlier run.py records the retained empty-discovery attempt; import only its
finite test family and provenance helpers. No production files are changed.
"""
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from run import ROOT, HERE, TESTS, bind_fixture, sha, source_closure, write_json


def main(skill_directory):
    skill = Path(skill_directory).resolve()
    runner, validator = skill / "scripts/run_experiment.py", skill / "scripts/validate_manifest.py"
    assert runner.is_file() and validator.is_file()
    output = HERE / "verified"
    assert not output.exists(), "Preserve prior run: use a fresh output directory for another campaign."
    # Repeat the cheap binding/import checks immediately before the accepted run.
    bind_fixture()
    assert source_closure() == json.loads((HERE / "source-pins.json").read_text())
    env = {key: value for key, value in os.environ.items() if not key.startswith(("FOUNDRY_", "DAPP_"))}
    env["FOUNDRY_PROFILE"] = "default"
    forge = shutil.which("forge")
    assert forge
    contract = json.loads((HERE / "contract.json").read_text())
    contract["execution_artifacts"] = sorted(set(contract["execution_artifacts"]) | {"test/evidence/engine-basic/run-selected.py"})
    write_json(HERE / "selected-contract.json", contract)
    # Forge matches its internal method filter beyond the bare name; a bare-name
    # trailing $ gave an empty run. Keep explicit names and check the exact result.
    command = [forge, "test", "--root", "packages/contracts", "--match-contract", "^(InteriorExecutionTest|MixedExecutionTest|MixedInvoiceTest)$", "--match-test", "^(" + "|".join(TESTS) + ")", "--threads", "1", "--offline", "-vv"]
    argv = [sys.executable, str(runner), "--root", str(ROOT), "--contract", str(HERE / "selected-contract.json"), "--output", output.relative_to(ROOT).as_posix(), "--timeout", "600", "--max-output-bytes", "1048576", "--max-threads", "1"]
    for name in contract["execution_artifacts"]:
        argv.extend(["--input", name])
    argv.extend(["--", *command])
    print("Executing the eight explicit non-fuzz methods; exact result-set validation follows.", flush=True)
    result = subprocess.run(argv, cwd=ROOT, env=env)
    stdout = (output / "stdout.txt").read_text(encoding="utf-8")
    stderr = (output / "stderr.txt").read_text(encoding="utf-8")
    print(stdout + stderr, end="", flush=True)
    passed = re.findall(r"^\[PASS\] (\w+)\(\)", stdout, re.MULTILINE)
    failed = re.findall(r"^\[FAIL[^\]]*\] (\w+)\(", stdout, re.MULTILINE)
    skipped = re.findall(r"^\[SKIP[^\]]*\] (\w+)\(", stdout, re.MULTILINE)
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    stable = next(item["passed"] for item in manifest["checks"] if item["check"] == "input hashes unchanged")
    exact = len(passed) == 8 and set(passed) == set(TESTS) and not failed and not skipped
    accepted = result.returncode == 0 and stable and exact and manifest["run"]["status"] == "completed"
    manifest["checks"].append({"check": "Exactly the eight selected non-fuzz test methods passed; no failed or skipped cases", "passed": exact})
    manifest["result"] = "Eight selected deterministic integration cases reproduced; implementation not independently audited and no complete-engine release acceptance established." if accepted else "Basic integration selection was not accepted; inspect exact discovery, failures and provenance."
    write_json(manifest_path, manifest)
    validation = subprocess.run([sys.executable, str(validator), str(manifest_path), "--root", str(ROOT)], cwd=ROOT, text=True, capture_output=True)
    (HERE / "selected-validation.txt").write_text(validation.stdout + validation.stderr, encoding="utf-8", newline="\n")
    print(validation.stdout + validation.stderr, end="")
    accepted = accepted and validation.returncode == 0
    summary = {
        "status": "passed" if accepted else "not-accepted",
        "passedTests": len(passed), "failedTests": len(failed), "skippedTests": len(skipped),
        "selectedTests": TESTS, "executedPassedTests": passed, "command": command,
        "sourceStable": stable, "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "runtimeSeconds": manifest["run"]["runtime_seconds"], "repository": manifest["repository"],
        "manifest": "test/evidence/engine-basic/verified/manifest.json",
        "stdout": "test/evidence/engine-basic/verified/stdout.txt", "stderr": "test/evidence/engine-basic/verified/stderr.txt",
        "validation": "test/evidence/engine-basic/selected-validation.txt",
        "sourcePins": "test/evidence/engine-basic/source-pins.json",
        "scope": "Eight deterministic local integration smoke checks; no fuzz, independent audit or complete-engine release acceptance.",
        "retainedUnacceptedAttempt": "test/evidence/engine-basic/run/manifest.json",
        "emptyDiscoveryCause": "This Forge build's bare method-name regex with a trailing $ discovers no tests; removing trailing $ discovers the methods. Exact executed names/count are now checked before accepting evidence.",
    }
    write_json(HERE / "summary.json", summary)
    print(json.dumps({key: summary[key] for key in ["status", "passedTests", "failedTests", "skippedTests", "runtimeSeconds", "sourceStable"]}))
    return 0 if accepted else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
