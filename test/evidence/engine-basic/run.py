"""Eight deterministic integration checks, with bounded v2 run provenance.

This reuses the installed computation-audit runner and cached Foundry project.
It does not run fuzz cases, mutate production code, or establish release readiness.
Pass the installed computation-audit skill directory as the only argument.
"""
import hashlib
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
TEST_FILES = ["InteriorExecution.t.sol", "MixedExecution.t.sol", "MixedInvoice.t.sol"]
TESTS = [
    "testProductionStaticQuotesSixPairsMatchIndependentIntegerSphere",
    "testAllSixPairsMutateOneOrderAndSettleGrossNetFeeExactly",
    "testInitializedOutwardThenActualReverseSettleIndependentRawOutputs",
    "testStaticMixedQuotesDoNotWriteStateOrEmitCrossings",
    "testCrossingBudgetFailureRollsBackThenRecovers",
    "testPostTransferSettlementFailureRollsBackFeesPrincipalAndEventsThenRecovers",
    "testMixedSwapPaysInvoiceAndPreservesDonationsAndApprovals",
    "testSecondRecipientFailureRollsBackRealMixedCurveThenRecovers",
]
IMPORT = re.compile(r'\bimport\s+(?:[^;]*?\sfrom\s+)?["\']([^"\']+)["\']\s*;')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def source_closure():
    remaps = [tuple(line.strip().split("=", 1)) for line in (CONTRACTS / "remappings.txt").read_text().splitlines() if "=" in line]
    pending = ["test/" + name for name in TEST_FILES]
    sources = {}
    while pending:
        name = pending.pop()
        assert not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts
        if name in sources:
            continue
        source = (CONTRACTS / name).resolve()
        assert source.is_relative_to(ROOT) and source.is_file()
        sources[name] = {"path": source.relative_to(ROOT).as_posix(), "sha256": sha(source)}
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
    return dict(sorted(sources.items()))


def bind_fixture():
    fixture = ROOT / "packages/reference/fixtures/reachable-traversal.json"
    data = json.loads(fixture.read_text())
    initial, first, second = data["initial"], data["swaps"][0], data["swaps"][1]
    assert initial["decimals"] == [6, 18, 6]
    assert list(map(int, initial["keys"])) == [3 * (1 << 32) // 2, 7 * (1 << 32) // 4, (1 << 64) - 1]
    assert list(map(int, initial["radii"])) == [r * 10**18 * (1 << 64) for r in [100, 200, 400]]
    mixed = dict(re.findall(r"uint256 constant (\w+)=(\d+);", (CONTRACTS / "test/MixedExecution.t.sol").read_text()))
    invoice = dict(re.findall(r"uint256 constant (\w+)=(\d+);", (CONTRACTS / "test/MixedInvoice.t.sol").read_text()))
    assert int(mixed["INITIAL_X"]) == int(invoice["INITIAL_X"]) == int(initial["coordinate"])
    assert int(mixed["FIRST_GROSS"]) == int(invoice["GROSS"]) == int(first["gross_input_raw"])
    assert int(mixed["FIRST_OUT"]) == int(invoice["OUTPUT"]) == int(first["witness"]["output_raw"])
    assert int(mixed["SECOND_GROSS"]) == int(second["gross_input_raw"])
    assert int(mixed["SECOND_OUT"]) == int(second["witness"]["output_raw"])
    assert [int(invoice["INITIAL_6"]), int(invoice["INITIAL_18"]), int(invoice["INITIAL_6"])] == list(map(int, initial["raw"]))
    assert int(invoice["FEE"]) == int(first["fee_raw"])
    assert int(invoice["OUTPUT"]) - int(invoice["DUE"]) == int(invoice["REFUND"])
    return fixture


def main(skill_directory):
    skill = Path(skill_directory).resolve()
    runner = skill / "scripts/run_experiment.py"
    validator = skill / "scripts/validate_manifest.py"
    assert runner.is_file() and validator.is_file()
    output = HERE / "run"
    assert not output.exists(), "Preserve existing evidence; choose a new run directory for another run."
    env = {key: value for key, value in os.environ.items() if not key.startswith(("FOUNDRY_", "DAPP_"))}
    env["FOUNDRY_PROFILE"] = "default"
    forge = shutil.which("forge")
    assert forge
    config = json.loads(subprocess.check_output([forge, "config", "--root", "packages/contracts", "--json"], cwd=ROOT, env=env))
    assert config["optimizer_runs"] == 700 and config["via_ir"] is True and config["evm_version"] == "cancun"
    assert config["solc"] == "0.8.30"
    fixture = bind_fixture()
    sources = source_closure()
    version = subprocess.check_output([forge, "--version"], text=True).strip()
    write_json(HERE / "source-pins.json", sources)
    write_json(HERE / "configuration.json", {
        "compiler": "0.8.30+commit.73712a01", "optimizer_runs": 700, "via_ir": True,
        "evm_version": "cancun", "profile": "default", "test_threads": 1,
        "hardware": "Windows 11; ASUS Vivobook Go E1504FA; 7,817,785,344 bytes physical memory; 8 logical processors",
        "environment_policy": "FOUNDRY_ and DAPP_ overrides removed; FOUNDRY_PROFILE=default. No environment values captured.",
        "fixture_binding": "Passed exact initial-state, both mixed swap outputs, fee and invoice/refund constant checks against the existing reference fixture; fixture generation and precision stability were not rerun.",
        "skill_runner_sha256": sha(runner), "skill_validator_sha256": sha(validator),
        "pre_run_git_status": subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=ROOT, text=True).splitlines(),
    })
    inputs = sorted({item["path"] for item in sources.values()} | {
        "packages/contracts/foundry.toml", "packages/contracts/remappings.txt",
        "packages/contracts/package.json", fixture.relative_to(ROOT).as_posix(),
        "test/evidence/engine-basic/run.py", "test/evidence/engine-basic/source-pins.json",
        "test/evidence/engine-basic/configuration.json",
    })
    contract = {
        "claim_id": "ENGINE-BASIC-EIGHT-DETERMINISTIC-INTEGRATION-CHECKS",
        "mathematics": {
            "assertion_tested": "The selected production-router integration cases reproduce expected exact outputs, accounting and rollback/recovery through local Aqua and invoice settlement.",
            "coefficient_domain": "Exact Solidity checked uint256 and Uint512 arithmetic; Q64 scaled internal reserves and Q32 tick keys; raw ERC20 6/18/6 decimal units.",
            "conventions": "Three tokens; three ticks at keys 1.5, 1.75 and full range; radii 100/200/400 whole units; fee 500 ppm. Gross includes fees; principal uses net input. All six directed interior pairs share an evolving order; mixed sequence is 350 units outward then 500 reverse.",
            "inputs": ["Existing InteriorExecutionTest, MixedExecutionTest, MixedInvoiceTest and their pinned transitive import closure", fixture.relative_to(ROOT).as_posix()],
            "bounds": {"test_count": 8, "test_names": TESTS, "tokens": 3, "ticks": 3, "interior_directed_pairs": 6, "mixed_crossing_budgets": [0, 1, 2], "invoice_due_raw": 150000000, "invoice_split_bps": [9000, 1000], "create2_salt_search_exclusive_bound": 4096, "fuzz_cases": 0, "timeout_seconds": 600, "combined_log_cap_bytes": 1048576},
            "non_claims": ["Not a new proof, independent implementation audit or paper verification.", "Not complete-engine acceptance, universal numerical liveness, worst-case 8-token/8-tick gas, fuzz or release campaign.", "Local in-process Foundry execution: no new Arc deployment, mined receipt, Privy signature or sponsor qualification evidence.", "Reference fixtures are retained existing inputs; this run does not regenerate them or establish precision stability.", "Windows runner limits direct process on timeout; no hard process-tree memory/CPU cap is claimed."],
        },
        "execution_artifacts": inputs,
        "software": [{"name": "forge", "version": version}, {"name": "solc", "version": "0.8.30+commit.73712a01"}],
        "randomness": {"used": False, "generator": "", "seed": None},
    }
    write_json(HERE / "contract.json", contract)
    command = [forge, "test", "--root", "packages/contracts", "--match-contract", "^(InteriorExecutionTest|MixedExecutionTest|MixedInvoiceTest)$", "--match-test", "^(" + "|".join(TESTS) + ")$", "--threads", "1", "--offline", "-vv"]
    argv = [sys.executable, str(runner), "--root", str(ROOT), "--contract", str(HERE / "contract.json"), "--output", output.relative_to(ROOT).as_posix(), "--timeout", "600", "--max-output-bytes", "1048576", "--max-threads", "1"]
    for path in inputs:
        argv.extend(["--input", path])
    argv.extend(["--", *command])
    print(f"Running exactly {len(TESTS)} tests with {len(sources)} imported source units; no fuzz.", flush=True)
    result = subprocess.run(argv, cwd=ROOT, env=env)
    print((output / "stdout.txt").read_text(encoding="utf-8"), end="", flush=True)
    print((output / "stderr.txt").read_text(encoding="utf-8"), end="", flush=True)
    validation = subprocess.run([sys.executable, str(validator), str(output / "manifest.json"), "--root", str(ROOT)], cwd=ROOT, text=True, capture_output=True)
    (HERE / "validation.txt").write_text(validation.stdout + validation.stderr, encoding="utf-8", newline="\n")
    print(validation.stdout + validation.stderr, end="")
    return result.returncode or validation.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
