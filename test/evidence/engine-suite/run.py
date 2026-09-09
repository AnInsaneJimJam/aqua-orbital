"""Run existing complete default contract/reference suites with bounded provenance.

Usage: python test/evidence/engine-suite/run.py <computation-audit skill> [all|contracts|reference]
Each output directory must be new. This never changes implementation or older evidence.
"""
import datetime
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CONTRACTS = ROOT / "packages/contracts"
IMPORT = re.compile(r'\bimport\s+(?:[^;]*?\sfrom\s+)?["\']([^"\']+)["\']\s*;')


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def contract_sources():
    remaps = [tuple(line.strip().split("=", 1)) for line in (CONTRACTS / "remappings.txt").read_text().splitlines() if "=" in line]
    pending = [p.relative_to(CONTRACTS).as_posix() for folder in ["src", "test"] for p in (CONTRACTS / folder).rglob("*.sol")]
    seen = {}
    while pending:
        name = pending.pop()
        assert not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts
        if name in seen:
            continue
        source = (CONTRACTS / name).resolve()
        assert source.is_relative_to(ROOT) and source.is_file()
        seen[name] = source.relative_to(ROOT).as_posix()
        for imported in IMPORT.findall(source.read_text(encoding="utf-8")):
            if imported.startswith("."):
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), imported))
            else:
                candidates = [(prefix, path) for prefix, path in remaps if imported.startswith(prefix)]
                if not candidates:
                    raise ValueError("Unresolved import: " + imported)
                prefix, path = max(candidates, key=lambda row: len(row[0]))
                target = path + imported[len(prefix):]
            pending.append(target)
    return dict(sorted(seen.items()))


def invoke(skill, mode):
    output = HERE / mode
    assert not output.exists(), "Preserve existing evidence; use a new output directory for reruns."
    # Match the documented existing full default-profile command in scripts/audit-contracts.py.
    # The strict revert policy prevents invariant reverts from being silently discarded;
    # gas snapshot comparisons are outside this ordinary suite.
    for key in list(os.environ):
        if key.startswith(("FOUNDRY_", "DAPP_", "ETHERSCAN_")) or key in ["ETH_RPC_URL", "ETH_RPC_JWT"]:
            del os.environ[key]
    overrides = {"FOUNDRY_PROFILE": "default", "FOUNDRY_INVARIANT_FAIL_ON_REVERT": "true", "FOUNDRY_GAS_SNAPSHOT_CHECK": "false"}
    os.environ.update(overrides)
    base_inputs = {"test/evidence/engine-suite/run.py", "packages/contracts/foundry.toml", "packages/contracts/remappings.txt", "packages/contracts/package.json"}
    if mode == "contracts":
        forge = shutil.which("forge")
        assert forge
        config = json.loads(subprocess.check_output([forge, "config", "--root", "packages/contracts", "--json"], cwd=ROOT))
        assert config["solc"] == "0.8.30" and config["optimizer_runs"] == 700 and config["via_ir"] and config["evm_version"] == "cancun"
        assert config["fuzz"]["runs"] == 256 and config["invariant"]["runs"] == 32 and config["invariant"]["depth"] == 64
        assert config["invariant"]["fail_on_revert"] is True
        assert all(config.get(k) is None for k in ["match_test", "no_match_test", "match_contract", "no_match_contract", "match_path", "no_match_path"])
        source_units = contract_sources()
        write(HERE / "contract-source-units.json", source_units)
        inputs = sorted(base_inputs | set(source_units.values()) | {"test/evidence/engine-suite/contract-source-units.json"})
        command = [forge, "test", "--root", "packages/contracts", "--offline", "--threads", "2", "--fuzz-seed", "0x20260908"]
        software = [{"name": "forge", "version": subprocess.check_output([forge, "--version"], text=True).strip()}, {"name": "solc", "version": "0.8.30+commit.73712a01"}]
        randomness = {"used": True, "generator": "Foundry 1.5.1 internal deterministic fuzz/invariant generator", "seed": "0x20260908"}
        bounds = {"selection": "All existing repository contract tests; no method, contract or path filters", "source_units": len(source_units), "test_files": len(list((CONTRACTS / "test").rglob("*.t.sol"))), "profile": "default", "fuzz_runs": 256, "invariant_runs": 32, "invariant_depth": 64, "threads": 2, "timeout_seconds": 1800, "combined_log_cap_bytes": 8388608}
        domain = "Exact Solidity checked integer arithmetic, Uint512 helpers, fixed-point Q64/Q128 quantities and raw ERC20 units; sampled fuzz inputs under existing per-test bounds."
        assertion = "The complete existing default-profile contract suite passes on the current pinned engine and imported contracts, including numerical, settlement, payment, fuzz and invariant cases."
    else:
        import mpmath
        paths = {p for p in (ROOT / "packages/reference").rglob("*") if p.is_file() and p.suffix in [".py", ".json", ".txt"] and "__pycache__" not in p.parts}
        # Reference literal-binding tests also read these contract tests.
        paths.update(p for p in (CONTRACTS / "test").rglob("*.sol"))
        inputs = sorted(base_inputs | {p.relative_to(ROOT).as_posix() for p in paths})
        command = [sys.executable, "-m", "unittest", "discover", "-s", "packages/reference/tests", "-v"]
        software = [{"name": "Python", "version": sys.version.split()[0]}, {"name": "mpmath", "version": mpmath.__version__}]
        randomness = {"used": False, "generator": "", "seed": None}
        bounds = {"selection": "All existing unittest-discovered test*.py modules in packages/reference/tests", "test_modules": len(list((ROOT / "packages/reference/tests").glob("test*.py"))), "precision": "Existing per-test mp.dps and exact arithmetic settings; unchanged", "timeout_seconds": 1800, "combined_log_cap_bytes": 8388608}
        domain = "Python exact integers and Fraction arithmetic plus arbitrary-precision mpmath under existing per-test precision and tolerance settings."
        assertion = "The complete existing Python reference test suite reproduces its finite mathematical and fixture assertions on the current pinned files."
    contract = {
        "claim_id": "EXISTING-ENGINE-SUITE-" + mode.upper(),
        "mathematics": {"assertion_tested": assertion, "coefficient_domain": domain, "conventions": "Repository's existing notation, fixed-point scaling, conservative rounding, explicit tick/reference conventions and test bounds are unchanged. No theorem or implementation changes are made.", "inputs": inputs, "bounds": bounds, "non_claims": ["Not a new mathematical proof, independent audit, security certification or full release acceptance.", "No additional CI/release fuzz counts, mutation campaign, target-network gas campaign or Privy wallet proof.", "A finite suite cannot establish universal engine liveness, all-size safety or correctness outside the tested cases.", "Windows enforces runner wall/log bounds but no hard process-tree memory or CPU cap is claimed."]},
        "execution_artifacts": inputs, "software": software, "randomness": randomness,
    }
    write(HERE / f"{mode}-contract.json", contract)
    write(HERE / f"{mode}-context.json", {"environmentOverrides": overrides if mode == "contracts" else {}, "preRunCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "preRunDirtyFiles": subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=ROOT, text=True).splitlines(), "hardware": "Windows 11, ASUS Vivobook Go E1504FA, 7,817,785,344 bytes physical memory, 8 logical processors", "bounds": bounds})
    # Call the installed helper's main(argv) directly to avoid Windows command-line
    # length limits for the complete import closure; the child is still explicit argv.
    scripts = skill / "scripts"
    sys.path.insert(0, str(scripts))
    spec = importlib.util.spec_from_file_location("engine_suite_provenance_runner", scripts / "run_experiment.py")
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    argv = ["--root", str(ROOT), "--contract", str(HERE / f"{mode}-contract.json"), "--output", output.relative_to(ROOT).as_posix(), "--timeout", "1800", "--max-output-bytes", "8388608", "--max-threads", "2" if mode == "contracts" else "1"]
    for name in inputs:
        argv.extend(["--input", name])
    argv.extend(["--", *command])
    print(f"Running complete {mode} suite; {len(inputs)} pinned inputs; 1800-second bound.", flush=True)
    code = runner.main(argv)
    manifest_path = output / "manifest.json"
    if not manifest_path.exists():
        return code or 1
    manifest = json.loads(manifest_path.read_text())
    text = (output / "stdout.txt").read_text(encoding="utf-8") + "\n" + (output / "stderr.txt").read_text(encoding="utf-8")
    counts = None
    if mode == "contracts":
        matches = re.findall(r"Ran (\d+) test suites? in .*?: (\d+) tests passed, (\d+) failed, (\d+) skipped", text)
        if matches:
            counts = dict(zip(["suites", "passed", "failed", "skipped"], map(int, matches[-1])))
    else:
        matches = re.findall(r"Ran (\d+) tests? in [\d.]+s", text)
        if matches:
            total = int(matches[-1])
            failures = re.findall(r"failures=(\d+)", text)
            errors = re.findall(r"errors=(\d+)", text)
            skips = re.findall(r"skipped=(\d+)", text)
            failed = (int(failures[-1]) if failures else 0) + (int(errors[-1]) if errors else 0)
            skipped = int(skips[-1]) if skips else 0
            counts = {"passed": total - failed - skipped, "failed": failed, "skipped": skipped}
    stable = next(row["passed"] for row in manifest["checks"] if row["check"] == "input hashes unchanged")
    accepted = code == 0 and stable and counts is not None and counts["passed"] > 0 and counts["failed"] == 0 and counts["skipped"] == 0
    manifest["checks"].append({"check": "Complete existing suite emitted a nonempty result with zero failures and skips", "passed": bool(accepted)})
    manifest["result"] = f"Existing {mode} suite reproduced within its stated bounds; no independent implementation audit or release acceptance established." if accepted else "Existing suite run not accepted; inspect failures, resource bounds and discovery."
    write(manifest_path, manifest)
    validation = subprocess.run([sys.executable, str(scripts / "validate_manifest.py"), str(manifest_path), "--root", str(ROOT)], cwd=ROOT, text=True, capture_output=True)
    (HERE / f"{mode}-validation.txt").write_text(validation.stdout + validation.stderr, encoding="utf-8", newline="\n")
    accepted = accepted and validation.returncode == 0
    summary = {"status": "passed" if accepted else "not-accepted", "mode": mode, "counts": counts, "sourceStable": stable, "runtimeSeconds": manifest["run"]["runtime_seconds"], "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "repository": manifest["repository"], "command": command, "bounds": bounds, "manifest": manifest_path.relative_to(ROOT).as_posix(), "stdout": (output / "stdout.txt").relative_to(ROOT).as_posix(), "stderr": (output / "stderr.txt").relative_to(ROOT).as_posix(), "validation": f"test/evidence/engine-suite/{mode}-validation.txt", "scope": "Complete existing suite at recorded default bounds; separate from an audit and full release acceptance."}
    write(HERE / f"{mode}-summary.json", summary)
    print(text[-2200:], flush=True)
    print(json.dumps({key: summary[key] for key in ["mode", "status", "counts", "runtimeSeconds", "sourceStable"]}), flush=True)
    return 0 if accepted else 1


def main():
    skill = Path(sys.argv[1]).resolve()
    mode = sys.argv[2] if len(sys.argv) > 2 else "all"
    assert mode in ["all", "contracts", "reference"]
    codes = [invoke(skill, selected) for selected in (["contracts", "reference"] if mode == "all" else [mode])]
    return max(codes)


if __name__ == "__main__":
    raise SystemExit(main())
