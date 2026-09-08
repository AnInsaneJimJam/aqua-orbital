# Independent lower-sheet proposal review

2026-09-08. Isolated read-only proof/source review; the only file written by
this reviewer is this report. The reviewer read the proposal and implementation
directly, including the complete helper, endpoint, evaluator, bracket and
composition sources, rather than relying on the author's route summary.

**Normalized claim.** For an integer point with `2 <= n <= 8`, every coordinate
in `[0,2^192)`, a valid output index, `0 <= sigmaHi < 2^192`, and a uint256
lower limit, a successful `LowerSheetProposal.cap` returns `z'` satisfying
`lower <= z' <= point[output]` and `rho(point with output z') >= sigmaHi`.
It does not mutate the point. Failure proves no infeasibility. The integrated
proposal changes seed discovery while retaining the original acceptance and
shared-work gates.

**Primary verdict: proved as written.** This verdict applies to the normalized
arithmetic and source-level preservation claims, under their stated domains.
No concrete defect was found. It does not promote the proposal into a root,
path, payout, general-liveness, deployment or gas certificate. Existing
certificate theorems, coefficient provenance and Solidity/EVM correctness
remain dependencies of the complete engine; this review does not re-prove
that entire engine.

## Dependency graph

```text
Validated n/index/coordinate bounds [source: prepareVertical]
  + sigma bound [source: cap]
  -> exact untouched moments T,B [internal arithmetic]
  -> V=mB-T^2=sum untouched pair differences squared >= 0 [identity]
  -> D=n(m*sigmaHi^2-V), only when positive [exact comparison]
  -> ceil sqrt(D), floor quotient [WideMath and integer rounding]
  -> successful capped point is on/below the lower sheet edge [inequality]

Proposal [no certificate flag]
  -> full evaluate + membership + strict output price [FrontierEndpoint]
  -> original low-seed construction [unchanged]
  -> both endpoints + critical points + radical signs [RootBracket]
  -> root identity
  -> initial GRID release + ordered schedule + connected arcs
     + actual payout/retention checks [unchanged complete caller]
  -> FrontierPathCertified, only if every gate succeeds
```

The proposal proof is elementary internal algebra. It requires no new external
paper theorem. `WideMath`'s local exact division/root proof and source were
read directly; the upstream attribution in its existing evidence is provenance,
not a claim that an upstream 256-bit root proves the local 512-bit adaptation.
Finite oracle evidence is a separate leaf and does not prove the universal
inequality. No dependency is supplied by the proposal's own success flag.

## Obligation matrix

| Obligation | Status | Decisive basis |
| --- | --- | --- |
| Exact dimensions, coordinate scale and output index | Passed | `CurveEvaluation.sol:33-40` validates every coordinate and index; `cap` checks sigma independently |
| Nonnegative unsigned moment subtraction | Passed | `mB-T^2` is the sum of squared differences over untouched pairs, including zero when `m=1` |
| Lower-root identity and sign before squaring | Passed | Expansion and completion of the square below; `T>=delta` is checked before subtraction |
| Upward root and downward coordinate rounding | Passed | Exact root-square comparison precedes increment; positive denominator `m`; successful `z'` cannot exceed the real lower edge |
| Full supported helper widths | Passed | Bounds below cover unequal coordinates, maximum dimension and values arbitrarily close to `2^192` |
| Caller-array preservation and lower-limit preservation | Passed | Helper and `prepareVertical` contain no point writes; true is returned only when the selected result meets `lower` |
| Zero sigma, no gap, invalid metadata, negative ceiling, lower failure | Passed | Zero/no-gap defer; invalid metadata reverts; negative ceiling defers; result below lower returns false |
| False/uncertain status is not global exclusion | Passed | The caller returns an unidentified proposal; it neither chooses an event nor marks a partition infeasible |
| Existing two-token behavior | Passed | Diff adds only the import and guarded `n>2` branch; the two-token clipping branch is unchanged |
| Full seed membership and output-price gate | Passed | `FrontierEndpoint.sol:154-175`; new point is fully re-evaluated before original seed logic |
| Original-radical signs and whole vertical domain | Passed | `RootBracket.sol:39-57` rechecks endpoints, strict high output price, `criticalPoints`, and both directed signs before certification |
| No bypass of initial release/events/arcs/final payout | Passed | Actual control flow in `FrontierComposition.sol:53-110` and `FrontierEndpoint.sol:81-119` remains unchanged |
| Shared refinement/crossing caps | Passed | No ledger writes in the new branch; zero-budget prefix discovery, shared remaining refinement and crossing accounting are retained |
| Existing complete geometric certificate soundness | Conditional | Named evaluator, root, segment, seam and composition results retain their existing hypotheses; this is a preservation audit, not a new full-engine proof |
| Hand/fuzz test breadth | Passed for stated finite assertions | Hand n2/n3/n5/n8 cases, one 192-bit fixture and equal-coordinate fuzz are meaningful but not exhaustive |
| Frozen pilot and baseline provenance | Passed | All eight output hashes, all 53 archived source pins and manifest schema checked; numerical witness matches the named regression literals |
| Post-change linked differential, runtime size and gas acceptance | Not addressed by this reviewer | Must be tied to rebuilt post-change artifacts; historical baseline cannot establish these results |
| General discovery, equality liveness, economic histories, release gates | Out of scope | Explicit non-claims of the proposal and retained pilot |

## Exact arithmetic and boundaries

Let `m=n-1`, `T=sum(untouched)` and `B=sum(untouched^2)`. Directly expanding
the full variance gives

```text
n*rho^2 = m*z^2 - 2*T*z + n*B - T^2,
V = m*B-T^2 = sum_{i<j, untouched}(Xi-Xj)^2,
n*(rho^2-sigmaHi^2) = ((m*z-T)^2-D)/m,
D = n*(m*sigmaHi^2-V).
```

The helper only proceeds when `D>0`. Its root routine returns an exact floor
root, with both square postconditions checked in `WideMath.sol:88-91`.
The additional comparison/increment therefore computes `delta=ceil(sqrt(D))`.
When `T>=delta`, `c=floor((T-delta)/m)` satisfies
`m*c-T <= -delta <= -sqrt(D)`. The chosen `z'=min(z,c)` preserves that
nonpositive sign, so squaring is valid and gives `rho^2>=sigmaHi^2`.
Nonnegative lengths imply the claimed radius inequality. This remains valid
when `z` was already below `c`, when the edge is integral, and when `c=0`.

Writing `L=2^192`, the worst-case helper bounds are

```text
T < 7L < 2^195,       B < 7L^2 < 2^387,
mB < 49L^2 < 2^390,  T^2 < 49L^2 < 2^390,
m*sigmaHi^2 < 7L^2 < 2^387,
0 < D < 56L^2 < 2^390,
delta <= 2^195.
```

Thus no squared moment is first truncated to uint256; every wide product and
subtraction fits Uint512. `delta+1` in the ceiling step, sums, scalar
differences and quotient fit uint256. The quotient cannot raise the returned
coordinate, so an accepted proposal remains below `2^192`. The lower limit
need not itself be below `2^192`: if it exceeds the original output, the
helper returns false before doing the moment arithmetic.

At `sigmaHi=0`, the threshold is no greater than `V`, hence the helper defers.
At `m*sigmaHi^2=V` it likewise defers even though the radius constraint may
hold everywhere. This is an intentional incomplete proposal, not an erroneous
infeasibility conclusion. A false return after clipping can contain a changed
scalar proposal value below `lower`; that value is unusable without the bool.
The input vector is still unchanged, and the integrated caller discards it.

For example, untouched coordinates 11 and 12 give `T=23`, `V=1`; with
`n=3,sigmaHi=3`, `D=51`, `delta=8`, and `c=7`. Replacing output 10 by 7
gives pair-square sum `16+25+1=42 >= n*sigmaHi^2=27`. This independently
checks the first unequal-coordinate hand example. For `n=2`, `V=0` and the
formula reduces to the existing lower-side clipping expression when a gap
exists; integration does not substitute it into the existing n2 branch.

## Why the seed cannot authorize an unsafe shortcut

`BelowSheet` and `UncertainSheet` are produced after the evaluator's affine
partition and principal checks, but neither supplies usable normal/residual
fields. The new branch uses only the status to request another point. It
does not consume any default residual or normal as a certificate.

After the proposal, the complete evaluator must still establish membership
and a strictly positive output normal. In particular `rho>=sigmaHi` by
itself does not certify aggregate or boundary prices, the invariant sublevel
set, or a useful root. The unchanged strong-convexity seed is subsequently
treated as a proposal by `RootBracket`; endpoint domain checks and exact
critical-point checks precede any accepted original-radical sign bracket.

Moving a high seed to the other side of a variance hole cannot replace the
initial-release proof: composition still calls
`certifyInwardReleaseToGrid` from the original actual reserves. That routine
checks both endpoint reconstructions and every crossed segment/seam, including
the variance minimum. The final-input high seed is not itself claimed to be
reachable by vertical release from the all-input point; final connectivity is
established separately by the original root/event/arc chain. Composition
continues to require `OrderingCertified`, strict progress-box ordering,
prefix-consistent arcs, `EndpointCertified`, retained seams, and the final
crossing ledger before setting `FrontierPathCertified`.

The new helper does a bounded pass over at most eight coordinates and one
bounded wide square root; it adds at most one full evaluation per eligible
`_identify` call. It adds no discovery/refinement loop. The unchanged prefix
attempts are bounded by the tick count, final refinement receives the original
remaining budget, and the only continuation receives that solve's remainder.
The 160 bound counts midpoint refinements, not all fixed certification work.
Total gas can increase and requires measurement even though these ledgers are
unchanged.

## Source and computation checks

Reviewed repository state: commit
`52f4c7df122c3c67ca00fc6f04a826ec52eb127f`, dirty working tree. SHA256 pins of
the reviewed core files are:

| File | SHA256 |
| --- | --- |
| `docs/audits/LOWER_SHEET_PROPOSAL.md` | `7ca818dac75166dd6006b5a4e52c77a4810f7f58fc5565cadcd49a65ad37d4e7` |
| `packages/contracts/src/libraries/LowerSheetProposal.sol` | `30f6f54d6b1491e9ee5d62ee30163c9bc8b1f58a4bc8297c227aecbb1548f9cb` |
| `packages/contracts/src/libraries/FrontierEndpoint.sol` | `7d7569a25afd6d38dedcf3e59b117f9f3de02f57116a05fb728ebbaa4c937058` |
| `packages/contracts/src/libraries/CurveEvaluation.sol` | `1537bc49e14837d32279279f99a1f09f937c3a9c17e7226fd7dbceab61a864be` |
| `packages/contracts/src/libraries/RootBracket.sol` | `0e19eb8cb8c7daa41a3ea4ed32c1f6751d254edf689ff140cb155a554dad529d` |
| `packages/contracts/src/libraries/FrontierComposition.sol` | `2b0cced7ca334b9eb814d821edbdcd4ebb40b4fc9219dd9beddf7bc07599069f` |
| `packages/contracts/src/libraries/SlackCertificate.sol` | `1f4fafba1f78f98fa1ac868ed6ddaad91e40bbef5dc079ca5cdddf50f72c4e17` |
| `packages/contracts/src/libraries/WideMath.sol` | `61a8fe0c6aa8dfeae0767a095e327c586b87963fdf9877b7dbaef0029d6f8a3d` |

Read checks used `rg`, line-numbered `Get-Content`, and
`git diff -- packages/contracts/src/libraries/FrontierEndpoint.sol`.
The diff contains only the new import and the guarded proposal/re-evaluation
block. No production or test file was modified by this reviewer, and no Forge
command, output directory or cache was used.

The baseline computation manifest passed the installed validator:

```powershell
python -B C:/Users/gujja/.codex/plugins/cache/openai-curated-remote/mathbox/2.2.0/skills/computation-audit/scripts/validate_manifest.py test/evidence/mixed-pilot/manifest.json
```

`Get-FileHash -Algorithm SHA256` verified all eight manifest outputs. A
read-only Python `tarfile`/`hashlib` check opened each path in
`source-pins.json` directly from `source-snapshot.tar.gz`, without extracting
files: all 53 hashes matched. Comparing those same pins with current files
found only `FrontierEndpoint.sol` changed. The new helper is naturally absent
from that historical source graph. These are provenance checks, not a rerun
of production execution.

The frozen `mixed-pilot.json` hash is
`faa71990daf327d438935b3a0a2ea545036a84549e4af252658c6b393fea28a3`.
Its generator constructs configurations and actions without calling Solidity;
actual raw payout endpoints are propagated to subsequent reference actions.
The retained generation log records equality of the 110- and 160-digit
corpora. The fixture contains 128 generated actions and 128 first-proposal
`primal_dual_witness` attempts; none used halving. The numerical oracle still
uses high-precision real arithmetic and finite path sampling, rather than
directed intervals or executed transaction history.

The named `n3-t8-moderate` step 2 witness agrees with the regression's start,
pair `(2,0)`, net raw input `870092451394`, decimals `[0,6,8]`, output `7478`,
actual final reserves, and prefix walk `[1,0,1,2,3,4,5,6,7]`. Its eight events
are key 0 inward, followed by keys 0 through 6 outward. This is a recovery
target derived independently of the new helper. The retained red and diagnosis
logs establish the old missing final seed and the reported four below-sheet
samples followed by a feasible midpoint.

The reviewed Solidity tests have SHA256
`f2ba2eda29ca63d53fb761f53a4b83ce4219461efb1111524f1d2012b54a2999`
(`LowerSheetProposal.t.sol`) and
`71a3bb2340d05cef46620e70d811113519c3d44072ed84c86f57a92000394189`
(`PilotReversal.t.sol`). The helper fuzz uses equal coordinates, varies n and
output, and checks the orthogonal full pair-variance inequality and frame
hash. The wide hand fixture also has equal coordinates. Consequently these
tests alone do not establish randomized unequal-moment, arbitrary-lower-limit
or all invalid-input coverage; the exact algebra supplies the universal
claim. A separate varied-coordinate exact oracle is appropriate supplemental
evidence and is outside this pinned test review.

The archived baseline reports 127/128 accepted independent observations and
31/32 completed production-contiguous histories. The deferral breaks one
history; an independently supplied later reference start does not turn that
broken history into an executed production continuation. Those baseline
results, bytecode sizes and gas values describe the archived implementation,
not this change. They must remain historical records rather than be relabeled
as post-change results.

## Remaining gap and strongest safe statement

There is no missing mathematical implication in the added proposal's stated
arithmetic claim, and no certificate or ledger bypass was found in the
integration. The strongest safe statement is that this is a sound bounded
seed proposal whose successful output must still pass every existing root,
path and actual-payout certificate.

The remaining improvement evidence is operational: run the named regression
and affected negative-domain/path/rounding/budget regressions, then compare
fresh linked production observations against the unchanged pilot with new
source/artifact hashes and measured runtime size/gas. This is the cheapest
check separating a sound proposal from demonstrated practical recovery.
Even 128/128 in that fixed corpus would not prove general discovery, endpoint
equality handling, economic-cycle safety, worst-range gas or release gates.
This reviewer did not rerun Forge or the 110/160-digit generator, and does not
claim those post-change results here.

Final mathematical self-proofreading covered this report only. No source
mathematical tokens were changed; no unresolved notation or reference issue
was identified in this report.
