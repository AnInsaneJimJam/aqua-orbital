# All-interior sphere step: bounded implementation evidence

`packages/contracts/src/libraries/SphereStep.sol` is a pure solver primitive,
**not the Orbital engine**. It accepts an actual integer reserve state, including
funded starting slack. It does not replace the mixed-boundary invariant or tick
traversal. Tests are in `packages/contracts/test/SphereStep.t.sol`.

## Contract and caller obligations

`SphereStep.step(X,R,input,output,inputAmount,outputScale)` requires 2–8 assets,
distinct valid pair indices, `0<R<2^160`, `0<=X_i<=R`, initial sphere membership,
positive input, and `X_input+inputAmount<=R`. `outputScale` is any positive integer
quantum in this mathematical primitive. The protocol caller must supply the
actual `10^(18-decimals)*2^64` scale from validated token metadata.

All amounts except `amountOutRaw` are integer internal lengths. The result is:

- `amountOutRaw`: the maximum payable whole number of output quanta on the lower
  sphere branch, with the given final input and unchanged other coordinates;
- `reserves`: a fresh array containing the exact input and actual rounded output
  changes; caller memory is preserved;
- `shortfallUpper`: an internal-length upper bound on unpaid ideal output and on
  final radial sphere slack, at most one `outputScale`.

The caller must independently certify all-interior tick/cap classification, the
absence of crossings, principal/virtual-offset bounds, appropriate starting
slack semantics, and settlement/fee accounting. No such qualification is implied
by a successful call. There is no router or quote integration in this change.

## Exact calculation and safety argument

Put `a=R-X_output`. Apply the exact input to obtain `X'_input`; keep every other
non-output coordinate unchanged. Calculate, with checked 512-bit sums/products,

```text
P = sum_{k != output} (R-X'_k)^2
D = R^2-P
r = floor(sqrt(D))
y_raw = floor((r-a)/outputScale).
```

Initial sphere feasibility gives `R^2>=sum_k(R-X_k)^2`. The positive input
decreases a nonnegative input deficit, so `P` cannot increase. Consequently the
radicand is nonnegative and at least `a^2`. The ideal output length is
`sqrt(D)-a`. A zero whole-quantum output is rejected.

For integers `a` and `q=outputScale>=1`,

```text
floor((sqrt(D)-a)/q) = floor((floor(sqrt(D))-a)/q).
```

Indeed, the fractional remainder in the square root is less than one, so it
cannot carry the integer remainder modulo `q` to another quantum. This is one
final output floor, not independent floors at event segments. It gives the
greatest whole payout with the fixed final input and this sphere domain.

Let `p=y_raw*q` and `a'=a+p`. Then `a'<=sqrt(D)` and
`P+(a')^2<=R^2`: the exact returned endpoint is feasible. Also
`p<=r-a<=R-a=X_output`, so payout multiplication and output subtraction are
bounded by existing output reserves. The next quantum has
`P+(a'+q)^2>R^2`; no larger whole payout is feasible within this fixed sphere.

Compute `c=ceil(sqrt(D))` by comparing `r^2` with `D`, and return

```text
shortfallUpper = c-a'.
```

The division remainder `r-a'` is an integer in `[0,q-1]`, and `c-r` is zero or
one. Thus

```text
0 <= sqrt(D)-a' <= shortfallUpper <= q.
```

The ideal deficit vector, with output deficit `sqrt(D)`, has norm `R`. Its
distance from the returned deficit vector is `sqrt(D)-a'`. The reverse triangle
inequality gives

```text
0 <= R-||R*1-X_end|| <= sqrt(D)-a' <= shortfallUpper.
```

The bound therefore has length units and also controls radial slack. It neither
changes `R` nor conceals starting slack in a reset invariant. For example the
four-token fixture `R=130`, `X=(65,69,65,65)`, input 52 in coordinate zero and
output from coordinate one pays 30, including four units of existing funded
slack. The corresponding frontier start `(65,65,65,65)` pays 26. These are
mathematical primitive fixtures, not asserted reachable token-transfer histories.

All lengths in arithmetic are below `2^160`; each square is below `2^320` and a
sum of eight such squares is below `2^323`. Validated input is bounded before
addition. The floor and ceiling roots are at most `R`. The work consists of
bounded loops over at most eight coordinates and the existing fixed 256-iteration
wide integer square root. No iteration-dependent convergence tolerance is used.

## Tests actually executed

The tests were written first against a compiling behavior stub. All 13 tests
failed through missing numerical results or missing typed reverts. No missing
dependency or compilation error was counted as the behavioral red result.

After implementation, from `packages/contracts`:

```powershell
forge test --match-contract SphereStepTest --fuzz-seed 0x20260908 -vv
```

Result: **13 passed, zero failed, zero skipped**. The fuzz entry reported 257
runs under the default 256-run profile; the tool-reported count is retained
exactly. Foundry suite runtime was 0.31760 seconds; compilation took
6.89 seconds. These timings are execution observations, not production gas or
performance acceptance.

The tests cover exact and irrational four-token analytic roots, actual starting
slack, non-divisible integer quanta, six/eighteen-decimal scales, invalid
dimensions/radius/pair/start/input/scale, zero raw output, and a near-`2^160`
eight-token fixture. The fuzz family covers dimensions 2–8 and the full positive
160-bit radius range above 31, with varied known-feasible deficits, input, and
quantum. There are no discarded or mass-rejected valid fuzz inputs.

The fuzz assertions do **not** run a second copy of the root solver. They use
exact square inequalities for actual endpoint feasibility, infeasibility of one
additional quantum, and the two bounding inequalities defining the ceiling
root. They also check exact input/output changes, untouched coordinates, and
the returned length bound. These properties are structural; finite fuzz success
is evidence about their implementation, not a universal proof of Solidity or of
`WideMath`.

Remaining work includes independent production integration review, all-interior
cap/no-crossing certification, mixed-boundary solves, global output bounds across
events, differential/reachability/cycle campaigns, and deployment qualification.

## Retained computation manifest

This embedded manifest keeps the bounded run metadata with its evidence. Its
JSON was extracted and successfully checked with the installed mathbox
computation-audit `scripts/validate_manifest.py`, and all three recorded input
SHA256 values were independently recomputed. It is not a repository-wide release
manifest.

```json
{
  "schema_version": 1,
  "claim_id": "sphere-step-exact-integer-primitive-2026-09-08",
  "repository": {
    "commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07",
    "dirty": true
  },
  "command": "forge test --match-contract SphereStepTest --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)",
  "environment": {
    "software": ["Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2", "Solidity 0.8.30", "optimizer 700, viaIR, Cancun"],
    "hardware": "Windows host; CPU model not collected; no performance claim"
  },
  "mathematics": {
    "assertion_tested": "Conservative maximal whole-quantum sphere output from actual feasible integer starts, and a length shortfall bound at most one output quantum",
    "coefficient_domain": "Unsigned integers with checked 512-bit square arithmetic",
    "conventions": "NUM-1 internal lengths; pure all-interior sphere only; explicit arbitrary positive output quantum",
    "inputs": [
      {"path": "packages/contracts/src/libraries/SphereStep.sol", "sha256": "fc913149d1c166afd5c15a3a9be37f05a026b1bb5d2fa2573ed867bb9e4f1de6"},
      {"path": "packages/contracts/test/SphereStep.t.sol", "sha256": "d10ad7d00744c84fbe0069e8edf698bac7d68e78384bfbe0abd8f309b5869d9c"},
      {"path": "packages/contracts/src/libraries/WideMath.sol", "sha256": "4f24492237e5909afc6312ac9326276aeaddcb8903bd0f84c5850e3f58dce2e8"}
    ],
    "bounds": {"dimensions": [2,8], "radius": "0<R<2^160; generated fuzz R>=32", "fuzz_runs_reported": 257, "tests": 13},
    "non_claims": ["Complete Orbital solver", "Tick-crossing or cap certification", "Reachable raw-token histories", "Release campaign or deployment readiness"]
  },
  "randomness": {"used": true, "generator": "Foundry fuzz generator", "seed": "0x20260908"},
  "run": {"started_at": "2026-09-08 UTC; precise process start not captured", "runtime_seconds": 0.31760, "timing_scope": "test-suite time only", "exit_status": 0},
  "outputs": [],
  "checks": ["Behavioral red: 13 failures against stub", "Green: 13 passed, no failures/skips", "Endpoint and next-quantum square inequalities", "Ceiling-root square bracket", "Exact coordinate changes", "Shortfall bound <= outputScale"],
  "result": "Implementation and finite assertions verified in the recorded range; exact argument documented separately above",
  "residual_risks": ["WideMath and Solidity arithmetic remain dependencies", "Complete protocol domains and integration are not certified here", "Finite fuzz coverage is not exhaustive"]
}
```
