# Global endpoint dual certificate

Observed 2026-09-08. The proof and implementation contract are in
[ROOT_CERTIFICATE.md](../../docs/audits/ROOT_CERTIFICATE.md). This is a bounded
G1 arithmetic/endpoint result, not a completed swap engine or deployment.

## Implemented

`packages/contracts/src/libraries/DualCertificate.sol` accepts actual geometric
candidate coordinates below `2^160`, two to eight exact nonnegative integer
prices no greater than `2^128`, positive output price, and one to eight valid
immutable ticks with total radius below `2^160`. It recomputes each support
branch from that price vector. It does not reuse the persisted partition or
the approximate sigma coefficient.

`evaluate` returns exact 512-bit dot cost, directed lower support cost, upper
gap and an explicit exclusion flag. A strict dot-cost deficit proves endpoint
infeasibility. `certifiesQuantum` compares the upper gap with the exact output
price times a caller-supplied quantum. The caller must separately establish
candidate feasibility/path/accounting and bind that quantum to the real
token's raw unit. An output-bound result alone is not permission to settle.

Square-root precisions are 112 fractional bits for the common sphere norm and
80 for the cancelled cap radical. The largest proved intermediate is below
`2^489`, all costs stay wide, and total support underestimation is below
`2^48+8` price-weight/internal-length units. This arithmetic error bound is
distinct from selecting prices tight enough to bound the real optimum.

## Test-first and measured checks

The initial stub run had **8 tests: 7 failed, 1 passed**. The scaling-only pass
against zero outputs was not counted as implementation evidence. Failures
covered missing support arithmetic, absent domain rejection, mixed branches,
the unsafe persisted-partition shortcut, exclusion and wide arithmetic.

The first implementation run passed 7 of 8. Its remaining failure was a test
that incorrectly expected a nonzero high limb for a roughly 228-bit support
cost at radius `1e30`. The assertion was corrected to require positive support;
the separate near-limit eight-token/eight-tick case already exercised nonzero
high limbs successfully. No failed mathematical counterexample was removed.

Final commands:

```powershell
forge test --root packages/contracts --match-contract DualCertificateTest --fuzz-runs 2048 --fuzz-seed 0xd0a1
python -m unittest discover -s packages/reference/tests -p test_root_certificate.py -v
python packages/reference/tests/test_root_certificate.py --fixtures
```

- Solidity: **9 tests passed, zero failures/skips**, including **2,048** seeded
  Pythagorean support/price/retention cases. The fresh final run used the
  optimized exact `WideMath` dependency with SHA256
  `61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d`.
  Forge reported 826.81 milliseconds for the suite; the measured process
  took 14.55 seconds including compilation. The earlier 8.01-second run
  preceded that arithmetic optimization and is historical.
- Independent reference: **3 tests passed**. Fixture integers agree at 110
  and 160 decimal digits. Fifteen cap/price combinations compare the cancelled
  support expression with explicit per-tick basket dot products at 160 digits.
- The retained counterexample demonstrates that choosing the support branch
  from the candidate's persisted partition can bound additional output below
  `0.1` while an additional `0.1` is feasible. Its exact-real derivation and
  integer fixture are both retained.

The Solidity fixtures include exact one-unit shortfall, strict support
exclusion, mixed three-token supports, zero other prices, equal prices,
price scaling, and near-limit eight-token/eight-tick free and boundary cases.
Fuzzing uses radii `5*(uint96+1)`, price weights `(3,4)*(uint120+1)` and retained
output `uint64+1`; it tests an exact analytic identity, not random full swaps.

Test fixture gas includes constructing tick coefficients and sometimes several
certificate evaluations. The largest final test reported 522,068 gas; this is
not a single evaluation benchmark or a measured router gas result. The prior
8,704,101-gas fixture used the pre-optimization arithmetic. Full swap gas,
deployment size, release campaigns and price selection remain outstanding.

Provenance and source hashes are in
[dual-certificate.manifest.json](dual-certificate.manifest.json). The
computation manifest records the dirty repository revision and actual bounded
commands. Reference precision agreement is finite numerical evidence, not a
universal proof of an optimizer or library. The general bound rests on the
explicit support inequality and directed arithmetic derivation.

## Remaining scope

The certificate does not find a candidate, construct a connected path, choose
prices, solve every mixed frontier root, pay fees or validate settlement. A
loose price vector can fail the quantum comparison without proving the trade
impossible. An output price of zero is rejected; a finite positive witness or
a separately proved one-sided endpoint procedure is required. The fixed-root
domain/bracketing and derivative formulas in the audit are not implemented by
this library. No G1/G2 release gate is closed by these tests alone.
