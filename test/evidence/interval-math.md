# Signed wide and directed interval arithmetic

`SignedWide.sol` and `IntervalMath.sol` implement numerical prerequisites from
NUM-5 and NUM-8. They do **not** implement crossing-root classification, a complete
swap engine, or a combined raw-output error budget. They introduce no economic
tolerance, saturation, or numerical clamp.

The focused implementation run passed **20 tests**, including six seeded fuzz
entries reporting 257 cases each. This is bounded implementation evidence; the
exact arithmetic arguments and remaining dependencies are stated below.

## API and representations

`SignedWide.Int512` is `{bool negative; WideMath.Uint512 magnitude}`. Its range is
`[-(2^512-1), +(2^512-1)]`, not the asymmetric range of a two's-complement signed
512-bit integer. Constructors and arithmetic return canonical nonnegative zero.
Even a manually constructed negative zero is interpreted numerically as zero.

| SignedWide entry point | Contract |
| --- | --- |
| `fromInt`, `fromUint`, `fromParts` | Exact conversion/construction; normalize zero |
| `add`, `sub`, `neg`, `compare` | Exact signed arithmetic and ordering; checked magnitude overflow |
| `product(int256,int256)` | Full-width exact signed product |
| `mulInt`, `mulUint` | Checked signed-wide multiplication by a signed or unsigned 256-bit scalar |
| `divDown`, `divUp` | Floor toward negative infinity / ceiling toward positive infinity; divisor is strictly positive uint256 |
| `toInt256` | Checked conversion; accepts exactly the int256 range, including its negative minimum |
| `divDownToInt256`, `divUpToInt256` | Directed division followed by that checked conversion |

`IntervalMath.Interval` is the compact closed enclosure `{int256 lo; int256 hi}`.
Its endpoints are **integer values in a caller-defined scale**, such as internal
lengths or fixed-point coefficients. Their products are not assumed to fit
int256. `WideInterval` contains two signed-wide endpoints and retains such
products without narrowing.

| IntervalMath entry point | Contract |
| --- | --- |
| `point`, `bounds`, `wideBounds` | Construct singleton or ordered enclosures; reject inverted bounds |
| `add`, `sub`, `neg` | Exact endpoint arithmetic with checked int256 results |
| `mulDiv(a,b,d)` | Enclose `a*b/d`, using full wide products and outward final division; exact `d>0` |
| `quotient(a,b,scale)` | Enclose `a*scale/b`; exact unsigned scale, and the entire denominator interval must be strictly positive |
| `wideProduct` | Exact signed 512-bit product range over independent intervals |
| `wideSquare` | Exact square range, retaining self-correlation and the zero minimum when the argument contains zero |
| `wideAdd`, `wideSub` | Exact wide endpoint addition/subtraction; checked 512-bit results |
| `sqrtWide` | Floor/ceiling roots of a nonnegative wide interval; preserves a possible ceiling of `2^256` |
| `sqrt` | The same root enclosure checked to fit compact int256 endpoints |

For example, multiplying an internal length by a Q128 coefficient uses
`mulDiv(length,coefficient,2^128)` to retain length units. Forming a Q128 ratio of
two lengths uses `quotient(numerator,denominator,2^128)`. The libraries do not
choose this scale or alter it when a sign cannot be certified.

Every operation checks ordered input intervals. Division rejects a denominator
that is zero, negative, or touches/crosses zero. Square root rejects a lower
radicand bound below zero, including an interval that merely overlaps zero.
Any compact endpoint outside int256 causes `Overflow()` instead of a cast wrap.
The caller must refine an uncertain domain or return its typed numerical failure.

## Exact rounding and enclosure arguments

Write an unsigned magnitude as `A=q*d+r`, with `d>0` and `0<=r<d`.
Positive floor is `q`; positive ceiling is `q+(r!=0)`. Negative floor is
`-(q+(r!=0))`; negative ceiling is `-q`. `SignedWide` selects the corresponding
directed magnitude division and then normalizes zero. Thus `-7/3` encloses as
`[-3,-2]`, not a truncation-based interval pointing inward.

Signed addition adds magnitudes when signs agree. With opposite signs, it
subtracts the smaller magnitude from the larger and retains the latter's sign.
This detects genuine magnitude overflow while permitting exact cancellation
across the 256-bit boundary. Negation does not change magnitude. Signed minimum
conversion uses `abs(v)=uint256(-(v+1))+1` for negative int256 values, so the
unrepresentable positive int256 absolute value is never constructed.

Interval sum/difference extrema are their usual directed endpoint sums. A
bilinear product on an independent rectangle reaches its extrema at the four
corners; all four products are evaluated exactly before final division. For
`a*scale/b` with `scale>=0` and `b>0`, the expression is linear in `a` for fixed
`b`, and monotone in `b` for a fixed signed `a`. Its extrema likewise occur at
corners. Floor the least quotient and ceil the greatest quotient. No denominator
sign inference or discarded product limb enters either calculation.

Squaring a single interval is handled separately from an independent product:
the minimum is zero exactly when the argument interval contains zero; otherwise
it is the smaller endpoint square. The maximum is the larger endpoint square.
This prevents a cross-zero square from acquiring the artificial negative lower
bound of an independent rectangle product.

Square root is monotone on nonnegative inputs. `sqrtWide([L,H])` therefore uses
the exact floor root of `L` and the exact ceiling root of `H`. It obtains the
ceiling by comparing the full square of the floor root with `H`; an unequal
square requires one additional integer. In the extremal case
`H=2^512-1`, the correct ceiling is `2^256`. It is retained as magnitude
`{hi:1,lo:0}` rather than wrapping a uint256. The compact root API rejects that
output because int256 cannot represent it.

These arguments establish each primitive's enclosure, conditional on the
underlying `WideMath` exact arithmetic. Correlation lost across separate interval
expressions may widen a result. A caller cannot interpret that widening as
permission to change principal, reset an invariant, or relax the raw-output
shortfall requirement. Combined error propagation remains an engine obligation.

## Widths and finite work

| Expression | Largest required representation / handling |
| --- | --- |
| int256 magnitude | At most `2^255`, including the negative minimum |
| Product of two int256 magnitudes | At most `2^510`, retained in 512 bits |
| Compact endpoint sum/difference | Magnitude at most `2^256`; compute wide, then reject if int256 result does not fit |
| Signed-wide times uint256 | May need up to 768 bits mathematically; existing `WideMath.scale` detects discarded high limbs/carry and rejects outputs beyond 512 bits |
| Wide endpoint sum/difference | Exact within magnitude `2^512-1`; checked overflow beyond that domain |
| Compact numerator times uint256 scale | Magnitude below `2^511`, so the full intermediate fits 512 bits |
| Directed wide division | Positive uint256 divisor; quotient magnitude cannot exceed the input magnitude |
| Full wide root | Floor at most `2^256-1`, ceiling at most `2^256`; both fit signed-wide magnitude |

Ordinary stored lengths below `2^160`, and proof-grid lengths below `2^192`, fit
the compact endpoint representation. Their squares require the wide helpers.
Each new engine expression still needs its own unit/range/error analysis; these
facts do not certify arbitrary discriminants or event quotients automatically.

The current dependency uses bounded 256-bit long division and a 256-trial integer
square root. Interval multiplication/quotient checks a fixed number of corners;
there is no data-dependent convergence loop. Gas optimization of those wide
primitives is separate work and must preserve exact results. `WideMath.sol` was
not modified in this task.

## Tests and independent golden values

The tests cover mixed-sign cancellation, canonical zero, negative floor/ceiling,
both signed cast limits, full-width directed quotient carries, magnitude overflow,
zero/cross-zero denominators, negative radical bounds, cross-zero squaring, and
the full 512-bit root ceiling. They also check exact and nonintegral products
against Python arbitrary-precision integer goldens.

The golden calculations are reproducible with Python 3.12:

```python
M = (1 << 350) + 17*(1 << 199) + 123456789
d = (1 << 120) + 12345
for x in (-M, M):
    print(x // d, -((-x) // d))
a = -((1 << 200) + 123456789)
b = (1 << 180) + 987654321
d = (1 << 150) + 17
print((a*b) // d, -((-(a*b)) // d))
```

These use Python's floor division and integer negation, not floating-point
division or a second copy of the Solidity implementation. The resulting literals
are retained in `testPythonBigintDirectedDivisionGolden` and
`testPythonBigintWideMulDivGolden`.

Fuzz families are deliberately bounded so their independent assertions fit
native int256: signed int128 add/sub/product, int128 divided by positive
65-bit divisors, signed int64 interval products and scaled quotients, full int256
comparisons, and roots of arbitrary unsigned radicands with up to 384 bits.
The interval tests check enclosure through exact cross-multiplication and also
show that moving either returned bound inward by one integer excludes a corner.
Root tests check both square inequalities directly, rather than invoking another
root implementation. No generated valid cases are discarded.

The final behavioral red run had **20 failing tests** against compiling stubs.
After implementation, the initial focused run passed all 20. The strengthened
final run used:

```powershell
forge test --match-contract 'SignedWideTest|IntervalMathTest' --skip RouterLifecycle.t.sol --fuzz-seed 0x20260908 -vv
```

Result: **20 passed, zero failed, zero selected tests skipped**; all six fuzz
entries reported 257 runs. Suite wall time was 0.45376 seconds and compilation
took 10.74 seconds. `RouterLifecycle.t.sol` alone was excluded from compilation
because another concurrent task had added a test for a not-yet-implemented
`Router.InvalidInitialAmounts` error. This was a narrow primitive check, not a
whole-repository green result. Subsequent integrated tests remain required.

## Retained computation manifest

The following manifest records the exact tested sources. It was extracted,
validated with the installed mathbox computation-audit validator, and its input
SHA256 values were recomputed. Timings are observations, not gas acceptance.

```json
{
  "schema_version": 1,
  "claim_id": "signed-wide-directed-interval-primitives-2026-09-08",
  "repository": {"commit": "2ecc6ce2f180fde239c13feee7dd09247c0d1b07", "dirty": true},
  "command": "forge test --match-contract 'SignedWideTest|IntervalMathTest' --skip RouterLifecycle.t.sol --fuzz-seed 0x20260908 -vv (cwd: packages/contracts)",
  "environment": {"software": ["Forge 1.5.1-stable b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2", "Solidity 0.8.30, optimizer 700, viaIR, Cancun", "Python 3.12.10 for independent goldens"], "hardware": "Windows host; no performance acceptance claim"},
  "mathematics": {
    "assertion_tested": "Exact signed magnitude arithmetic, outward-directed interval endpoints, and full wide root enclosures in the recorded finite families",
    "coefficient_domain": "Integer and rational inequalities; no floating-point oracle",
    "conventions": "Negative floor is toward negative infinity; positive denominators; no saturation; arbitrary caller-defined integer scale",
    "inputs": [
      {"path": "packages/contracts/src/libraries/SignedWide.sol", "sha256": "8142108db5cc11ddf3a33e17855c7ca4a467f22687194967c28588aef6cb4426"},
      {"path": "packages/contracts/src/libraries/IntervalMath.sol", "sha256": "e7ea7cd4aa5bb7a63f52b665f1311667bb52715f8a4a5ad32a4dde30bd820898"},
      {"path": "packages/contracts/test/SignedWide.t.sol", "sha256": "0a020a1c93eaf39f5685e12812aa9055e476f6352fea81ee5bf0a10ae49d7a82"},
      {"path": "packages/contracts/test/IntervalMath.t.sol", "sha256": "95279e7b163bdafbe18caf8e27d27727f1e84c05bf2cd1b953b6c6f64b2d9da4"},
      {"path": "packages/contracts/src/libraries/WideMath.sol", "sha256": "4f24492237e5909afc6312ac9326276aeaddcb8903bd0f84c5850e3f58dce2e8"}
    ],
    "bounds": {"tests": 20, "fuzz_entries": 6, "reported_cases_per_fuzz_entry": 257, "wide_magnitude_bits": 512, "compact_endpoint_bits": 256},
    "non_claims": ["Complete Orbital solver", "Combined output-error budget", "Certified crossing-event ordering", "Exhaustive fuzzing", "Whole-repository green test result"]
  },
  "randomness": {"used": true, "generator": "Foundry fuzz generator", "seed": "0x20260908"},
  "run": {"started_at": "2026-09-08 UTC; precise process start not captured", "runtime_seconds": 0.45376, "timing_scope": "test-suite wall time only", "exit_status": 0},
  "outputs": [],
  "checks": ["20 behavioral red failures against stubs", "20 final passing tests", "Exact Python bigint goldens", "Independent native cross-multiplication and tight endpoint checks", "Full square/root inequalities", "Canonical zero and explicit overflow/domain failures"],
  "result": "Implementation and finite assertions verified in the recorded range; enclosure arguments documented above",
  "residual_risks": ["WideMath correctness is a dependency", "Production expressions require separate unit and error propagation", "Current wide arithmetic gas is not optimized", "Concurrent unrelated lifecycle test excluded from this focused compile"]
}
```
