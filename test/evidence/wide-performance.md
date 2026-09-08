# Exact wide arithmetic performance

`WideMath.div` and `WideMath.sqrt` now use bounded exact algorithms with the same
public interfaces and domain errors. The optimized dependency passed **96 tests
across nine math suites**, including **26 new legacy-oracle, boundary, and gas
tests**. No arithmetic tolerance or solver acceptance condition changed.

Representative same-wrapper measurements:

| Operation and input | Before | Optimized | Retained legacy implementation in optimized build |
| --- | ---: | ---: | ---: |
| Arbitrary 512/256 division | 49,097 gas | 1,984 gas | 49,017 gas |
| 377-bit square root | 144,308 gas | 13,852 gas | 144,397 gas |

The measured reductions versus the pre-edit baseline are approximately 96% and
90%. These figures include the same external test-wrapper overhead and describe
the recorded inputs, not every arithmetic input or the complete swap gas budget.
The benchmark logs measure both results and assert equality; they contain no
arbitrary gas-limit pass condition.

## Primary-source provenance and license

The exact-division reduction and inverse steps were adapted from the pinned
[OpenZeppelin Contracts v4.9.6 Math.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/math/Math.sol),
which credits Remco Bloemen and Uniswap Labs. The arbitrary-numerator remainder
and the 512-bit Newton range/postcondition argument are local adaptations. The
full [MIT notice](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/LICENSE)
and copyright attribution are retained in `WideMath.sol`.

Authenticated primary-source bytes on 2026-09-08:

| Source | Bytes | SHA256 |
| --- | ---: | --- |
| `v4.9.6/contracts/utils/math/Math.sol` | 12,785 | `85a2caf3bd06579fb55236398c1321e15fd524a8fe140dff748c0f73d7a52345` |
| `v4.9.6/LICENSE` | 1,107 | `0e05b4f45c8769ece14ba2d202bf6f5ed7132600b642c981266f7255e0187ea3` |

Both were read from the official repository's `raw.githubusercontent.com` URLs.
No assertion that upstream's 256-bit root directly implements this 512-bit root
is made.

## Arbitrary-numerator division proof

Let `B=2^256`, numerator `A=hi*B+lo`, and divisor `d`. The unchanged public domain
requires `d>0` and `hi<d`; equivalently the floor quotient fits uint256. A zero
high limb keeps the native division/remainder path.

For an arbitrary nonzero high limb, calculate

```text
radix = (B mod d) = addmod(MAX % d, 1, d)
r = addmod(mulmod(hi, radix, d), lo % d, d).
```

The EVM modular operations preserve the complete sum/product, so `r=A mod d`
even though `B` itself cannot be represented in uint256. This is essential: a
remainder expression derived only from an unavailable pair of product operands
would not handle an arbitrary 512-bit numerator.

Subtract `r` from the low limb, borrowing one from the high limb when needed.
The resulting integer `N=A-r` is nonnegative and divisible by `d`. Factor
`d=t*odd`, where `t` is its positive power-of-two divisor. Since `t` divides `B`,
`lo/t` and the shifted high-limb contribution have disjoint low bit ranges.
Their bitwise union reconstructs `N/t mod B`. When `t=1`, `B/t mod B=0`; the
intentional modular zero in that conversion is correct, not a lost quotient bit.

For odd `odd`, the seed `(3*odd) XOR 2` is an inverse modulo 16. Each update

```text
inverse <- inverse*(2-odd*inverse) mod B
```

squares the inverse error: if `odd*inverse=1-e`, the next product is `1-e^2`.
Six updates extend 4 correct low bits to 256. Thus multiplication by the final
inverse gives `N/d mod B`. Because `hi<d` already proves the true quotient is
less than `B`, this modular value is the exact quotient. The original `r` is
returned unchanged.

The `unchecked` block implements only these specified modular operations and
the limb borrow. It does not suppress an input/output range check or replace
wide arithmetic by a truncated approximation. Division by zero and quotient
overflow retain the original `DivisionByZero()` and `Overflow()` errors.

## Bounded 512-bit square root proof

The result must satisfy the exact postconditions

```text
result^2 <= A < (result+1)^2.
```

Both are checked before return. When `result=MAX`, the second bound is exactly
`A<2^512`, already guaranteed by the input representation, so no overflowing
square is evaluated. Zero also passes these postconditions directly.

The region `A>=MAX^2` has floor root `MAX`. Its lower threshold is represented
exactly as `{hi:MAX-1,lo:1}`. This includes the largest 512-bit radicand and avoids
trying to represent an initial upper guess of `2^256` in uint256.

For every other positive input, let `s=sqrt(A)`. A bit-length-derived power of
two supplies an upper guess `x_0` with `s<x_0<=2s`. Where that power would equal
`2^256`, use `MAX`; the preceding threshold exclusion proves `MAX>s`, while the
high-bit range retains `MAX<=2s`.

At each iteration, a candidate whose square is at most `A` is already the floor
root, by the lower-bound invariant below. Otherwise use

```text
q = floor(A/x)
x_next = floor((x+q)/2)
       = (x AND q) + ((x XOR q) >> 1).
```

The bitwise average is exact and cannot overflow. Before division, `x^2>A`
implies `hi<x`: if `hi>=x`, then `A>=hi*B>=x*B>x^2`, a contradiction. Therefore
the existing 512/256 quotient API is valid at every update. This also prevents
a spurious division overflow just below the last perfect square, where the
finished floor root can equal `hi`.

Integer Newton equals the floor of the corresponding real Newton expression.
The arithmetic-geometric-mean inequality therefore keeps every candidate at
least `floor(s)`. Until the floor root is reached, the real Newton map is
monotone on `[s,infinity)`, so integer iterates are at most the matching real
iterates `y_j` starting from the same upper bound.

Writing `e_j=(y_j-s)/s`,

```text
e_(j+1) = e_j^2 / (2*(1+e_j))
e_0 <= 1,  e_1 <= 1/4
e_j <= 2^(1-3*2^(j-1))  for j>=1.
```

After nine updates, `y_9-s < 2^256*2^-767 = 2^-511`. For a nonsquare integer
`A`, the distance from `s` to `ceil(s)` is

```text
ceil(s)-s = (ceil(s)^2-A)/(ceil(s)+s) > 2^-257.
```

The real iterate is therefore strictly below `ceil(s)`, forcing the integer
candidate to equal `floor(s)`. For a perfect square, an absolute error below one
already forces the same integer result. The loop thus needs at most nine
updates, followed by the mandatory exact square checks. This is a uniform range
argument for 512-bit radicands, not a bound inferred from successful samples.

`_log2` performs at most eight fixed binary reductions. No loop depends on a
floating tolerance or silently returns an unconverged iterate. The final
assertions remain internal correctness checks even though the argument proves
their success for every valid input, conditional on the exact lower primitives.

## Independent oracles and executed range

`test/WideMathFast.t.sol` retains the previous 256-bit long division and greedy
trial square root in `LegacyWideOracle`. Neither oracle calls the new division
or square root. Their multiply/compare dependencies are the existing unchanged
primitives. A separate arbitrary-numerator quotient/remainder fixture is also
computed with Python big integers:

```python
hi = 2**200 + 2**77 + 12345
lo = 2**250 + 2**99 + 7
d = 2**255 - 19
print(divmod(hi*2**256 + lo, d))
```

The tests cover arbitrary valid high/low limbs, not merely exact products;
odd, maximum, and every power-of-two divisor; low-limb borrowing; invalid
divisors and quotient bounds; the maximum radicand; the last perfect square
and its neighbors; and every radicand bit span from 1 through 512. Seeded fuzz
compares arbitrary division and bit-span roots against the retained algorithms,
and checks perfect-square neighbors over uint256 root inputs.

Each division also reconstructs the original numerator from `q*d+r` and checks
`r<d`. Root checks use both exact square inequalities. No generated valid fuzz
input is discarded. One initial attempt to run all deterministic root spans in
a single test exceeded Foundry's gas allowance through accumulated legacy
allocation/work; the corpus was split into sixteen tests of 32 spans each,
preserving every original span and neighbor. No mathematical counterexample was
removed or attributed to numerical tolerance.

The complete new suite passed before changing `WideMath`, recording the baseline
gas. After optimization the same 26 tests passed with seed `0x20260908`. The
broader command was then run from `packages/contracts`:

```powershell
forge test --match-contract '^(WideMathTest|WideMathFastTest|SignedWideTest|IntervalMathTest|TickGeometryTest|CertificateTest|SlackCertificateTest|SphereStepTest|FrontierEventsTest)$' --fuzz-seed 0x20260908 -vv
```

Result: **96 passed, zero failed, zero skipped**, with no compilation exclusions.
The broad test-suite wall time was 0.41666 seconds, excluding 37.51 seconds of
compilation. The three new fuzz entries each reported 256 runs. Other included
fuzz entries reported their existing 256/257 counts. These are local campaigns,
not the 10,000-case release profile.

The new dependency hash is
`61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d`.
The root and other active implementation agents were notified. Earlier evidence
manifests with `4f2449...dce2e8` identify historical runs of the legacy dependency;
they are not silently rewritten as evidence of this version.

## Retained computation manifest

This embedded manifest was extracted and checked with the installed mathbox
validator; both recorded local input hashes were independently verified.

```json
{
  "schema_version": 1,
  "claim_id": "fast-exact-wide-arithmetic-2026-09-08",
  "repository": {"commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07", "dirty": true},
  "command": "forge test --match-contract '^(WideMathTest|WideMathFastTest|SignedWideTest|IntervalMathTest|TickGeometryTest|CertificateTest|SlackCertificateTest|SphereStepTest|FrontierEventsTest)$' --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)",
  "environment": {"software": ["Forge 1.5.1-stable", "Solidity 0.8.30, optimizer 700, viaIR, Cancun", "Python 3.12.10 bigint golden"], "hardware": "Windows host; wrapper gas measured, no complete swap budget claim"},
  "mathematics": {
    "assertion_tested": "Optimized arbitrary 512/256 quotient/remainder and floor sqrt512 match independent retained algorithms, exact postconditions, and a Python bigint golden",
    "coefficient_domain": "Exact unsigned integers; specified modular inverse operations",
    "conventions": "Unchanged WideMath APIs and errors; nine bounded Newton updates with final square certificates",
    "inputs": [
      {"path": "packages/contracts/src/libraries/WideMath.sol", "sha256": "61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d"},
      {"path": "packages/contracts/test/WideMathFast.t.sol", "sha256": "213a4ca61912c7a7e89381fe325ac6e454e62915a30a5a40a4a37fd808ab96b5"}
    ],
    "bounds": {"new_tests": 26, "broad_math_tests": 96, "new_fuzz_entries": 3, "cases_per_new_fuzz_entry": 256, "radicand_bits": [1,512], "divisor_power_cases": 256, "max_newton_updates": 9},
    "non_claims": ["10,000-case release campaign", "Complete swap gas acceptance", "Complete engine correctness", "Upstream authentication of the local 512-bit Newton adaptation"]
  },
  "randomness": {"used": true, "generator": "Foundry fuzz generator", "seed": "0x20260908"},
  "run": {"started_at": "2026-09-08 UTC; precise process start not captured", "runtime_seconds": 0.41666, "timing_scope": "broad test-suite wall time only", "exit_status": 0},
  "outputs": [],
  "checks": ["26 baseline tests before implementation", "26 optimized oracle/boundary tests", "96 broad math regressions", "Quotient reconstruction and remainder bounds", "Final lower and upper square inequalities", "Source and MIT license authenticated"],
  "result": "Recorded finite assertions and exact postconditions pass; uniform division/root arguments documented above",
  "residual_risks": ["Compiler/EVM and unchanged multiply/compare primitives remain dependencies", "Independent review of the local adaptation remains appropriate", "Gas figures are representative measured inputs", "Release-scale and engine campaigns remain separate"]
}
```
