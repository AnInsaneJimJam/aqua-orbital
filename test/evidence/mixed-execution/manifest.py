"""Record the focused mixed integration checkpoint; does not execute tests."""
import hashlib
import json
import platform
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
CONTRACTS = ROOT / "packages/contracts"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    names = ["OrbitalSwapVMRouter", "OrbitalStorage", "OrbitalSettlement",
             "FrontierComposition", "FrontierEndpoint", "OrbitalOrderCodec", "StrategyInitializer"]
    artifacts = {}
    source_files = set()
    for name in names:
        path = CONTRACTS / "out" / f"{name}.sol" / f"{name}.json"
        artifact = json.loads(path.read_text())
        for source in artifact["metadata"]["sources"]:
            actual = CONTRACTS / source
            if not actual.is_file():
                raise FileNotFoundError(actual)
            source_files.add(actual)
        record = {"artifact_sha256_at_focused_checkpoint": digest(path)}
        for field in ("bytecode", "deployedBytecode"):
            value = artifact[field]
            bytecode = value["object"].removeprefix("0x")
            record[field] = {
                "bytes": len(bytecode) // 2,
                "unlinked_object_text_sha256": hashlib.sha256(value["object"].encode()).hexdigest(),
                "links": value.get("linkReferences", {}),
            }
        artifacts[name] = record
    # Include the concrete Aqua/ERC20 implementations and test harness closure,
    # not just the interfaces reachable from production Router metadata.
    suites = ["MixedExecution", "MaximumActivation", "InteriorProbe", "LocalUSDC", "InteriorSwap",
              "InteriorExecution", "RouterLifecycle", "FeeInstruction", "Settlement", "LinkedMath", "ReachableComposition"]
    for suite in suites:
        path = CONTRACTS / "out" / f"{suite}.t.sol" / f"{suite}Test.json"
        for source in json.loads(path.read_text())["metadata"]["sources"]:
            actual = CONTRACTS / source
            if not actual.is_file():
                raise FileNotFoundError(actual)
            source_files.add(actual)
    extras = ["packages/contracts/foundry.toml", "packages/contracts/remappings.txt",
              "packages/contracts/test/MixedExecution.t.sol", "packages/contracts/test/MaximumActivation.t.sol",
              "packages/contracts/test/InteriorProbe.t.sol", "packages/contracts/test/RouterLifecycle.t.sol",
              "packages/contracts/test/InteriorExecution.t.sol", "packages/contracts/test/InteriorSwap.t.sol",
              "packages/contracts/test/ReachableComposition.t.sol", "packages/contracts/test/LinkedMath.t.sol",
              "packages/contracts/test/LocalUSDC.t.sol", "packages/contracts/test/fixtures/LocalUSDC.sol",
              "packages/reference/fixtures_reachable_traversal.py", "packages/reference/fixtures_frontier_composition.py",
              "packages/reference/orbital.py", "packages/reference/fixtures/reachable-traversal.json",
              "packages/reference/tests/test_mixed_execution_literals.py", "test/evidence/mixed-execution/manifest.py"]
    source_files.update(ROOT / extra for extra in extras)
    inputs = {str(path.relative_to(ROOT)).replace("\\", "/"): digest(path) for path in sorted(source_files)}
    match = "^(MixedExecutionTest|MaximumActivationTest|InteriorProbeTest|LocalUSDCTest|InteriorSwapTest|InteriorExecutionTest|RouterLifecycleTest|FeeInstructionTest|SettlementTest|LinkedMathTest|ReachableCompositionTest)$"
    start = lambda name: (BASE / name).read_text(encoding="utf-8-sig").strip()
    result = {
        "schema": 1,
        "scope": "Bounded real Router/Aqua mixed execution from actual initialization; no full-range, live deployment or Privy qualification claim",
        "head_at_recording": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "tree": "dirty",
        "environment": {"python": platform.python_version(), "platform": platform.platform(), "solc": "0.8.30",
                        "optimizer_runs": 700, "via_ir": True, "evm": "cancun", "forge": subprocess.check_output(["forge", "--version"], text=True).strip()},
        "commands": {
            "final": f"forge test --root packages/contracts --match-contract '{match}' --threads 2 --fuzz-seed 0x20260908 -vv",
            "reference_literal_binding": "python -m unittest discover -s packages/reference/tests -p test_mixed_execution_literals.py -v",
            "manifest": "python test/evidence/mixed-execution/manifest.py",
        },
        "runs": {
            "red": {"start_observed_utc": start("red-start.txt"), "compile_seconds": 59.41,
                    "pass": 2, "expected_fail": 10, "suites": 3,
                    "scope": "6 mixed Router,2 new probe deferrals,2 local fixture behavior expected failures; old probe success/errors pass"},
            "first_build": {"start_observed_utc": start("green-start.txt"), "compile_seconds": 9.97,
                            "status": "IR stack-too-deep; no tests executed"},
            "first_green": {"start_observed_utc": start("green-refactor-start.txt"), "compile_seconds": 181.29,
                            "pass": 74, "historical_error_assertion_fail": 1, "suites": 8},
            "final": {"start_observed_utc": start("final-start.txt"), "compile_seconds": 86.35, "runner_seconds": 1.72,
                      "pass": 88, "fail": 0, "skipped": 0, "suites": 11, "seed": "0x20260908",
                      "fuzz_observed": {"fee_wide": 257, "interior_units": 256, "real_two_leg_cycles": 256}},
            "reference_literal_binding": {"pass": 3, "fail": 0, "runner_seconds": 0.004, "exact_start_not_captured": True},
        },
        "gas": {"first_mixed_external_swap": 5166603, "second_mixed_external_swap": 5833358,
                "maximum_8x8_external_activation": 3791206, "maximum_8x8_external_ship": 231896,
                "scope": "Actual external call gas including ABI and execution; setup/assertions and transaction intrinsic cost excluded. Mixed calls cool router, linked libraries, Aqua and tokens. No minimum EIP150 forwarded-gas or worst-supported-configuration swap claim."},
        "artifacts": artifacts,
        "input_files_sha256": inputs,
        "logs_sha256": {path.name: digest(path) for path in sorted(BASE.glob("*.txt"))},
        "proof_dependencies": ["docs/audits/MIXED_ROUTER_INTEGRATION.md", "docs/audits/FRONTIER_COMPOSITION.md",
                               "docs/audits/NEGATIVE_PRICE_EXCLUSION.md", "test/evidence/negative-price.md"],
        "review": "Root and backend read-only source review, conditional on authenticated immutable strategy metadata, existing math certificates, and pinned linked code identity; no concrete defect found",
        "limitations": ["Named initialized n3 swaps do not close full supported-range liveness or release campaigns",
                        "Pure helper retention phases are integrated, but these real mixed fixtures contain ideal frontier events only",
                        "Working tree/source hashes describe this focused checkpoint; a later root full suite or generator may reserialize artifacts",
                        "No live Arc deployment, network identity, signed receipt or Privy integration is established here"],
    }
    (BASE / "manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Recorded {len(inputs)} input hashes and {len(artifacts)} linked artifacts.")


if __name__ == "__main__":
    main()
