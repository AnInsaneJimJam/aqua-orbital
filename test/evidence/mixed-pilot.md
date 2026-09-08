# Initialized mixed pilot and lower-sheet discovery recovery

2026-09-08. **128/128 finite comparisons pass, with 32/32 complete initialized
net-input histories.** The original 127/128 result remains a separate historical
baseline. This closes the named eight-tick reversal deferral, not G1/G2 release
acceptance, general discovery, economic campaigns, or target gas acceptance.

## Independent input family

The deterministic matrix is dimensions `{2,3,5,8}` × tick counts `{1,2,3,8}` ×
two radius/concentration families. Each configuration starts from the independent
equal-point initializer and has four directed actions: `(0,n-1)`, `(0,n-1)`,
`(n-1,0)`, `(1,0)`. Inputs use respectively `1/128,1/8,3/8,1/64` of remaining
input-axis capacity, quantized in raw input units. Decimals rotate through
`0,6,8,18`. Radii are `1000*(j+1)` or `1000*10^j` whole-token units, with
ordinary keys above the exact supported minimum and a full-range anchor.
These are tested ranges, not new supported onchain limits.

`packages/reference/fixtures_mixed_pilot.py` calls the independent price-space,
explicit-per-tick reference. Every next start is the preceding **actual raw
payout** endpoint. It verifies primal/dual baskets, frontier events, sampled
arc interiors and actual endpoint reconstruction independently of production
acceptance. The separate n2/full-range control uses the analytic sphere formula.
The generator allows bounded halving after an independent failure, but all 128
actions succeeded on the first proposal; none was excluded or halved.

The complete serialized corpus is identical at 110 and 160 digits. Generation
took 560.278 seconds, below its 900-second cap, with unchanged inputs.
Fixture SHA256: `faa71990daf327d438935b3a0a2ea545036a84549e4af252658c6b393fea28a3`.
[Generation record](mixed-pilot/generation.json), [transcript](mixed-pilot/generation.txt).

High precision and finite path samples remain numerical evidence. These are
net curve actions, not an ERC20/fee/Aqua/invoice transaction matrix. This family
contains no initial-release or final-retention transitions; earlier seam and
retention corpora remain separate requirements.

## Baseline, diagnosis and repair

The original linked dispatch accepted 68 interior and 59 mixed results, with
one conservative final-discovery deferral. That breaks one production-contiguous
history: 126 contiguous accepted actions and 31 complete histories. A later
independent reference start does not repair the missing production action.
[Baseline record](mixed-pilot/observations.json), [manifest](mixed-pilot/manifest.json).

The retained failure is `n3-t8-moderate-step2`: decimals `[0,6,8]`, net raw
input `870092451394` in asset 2, expected output **7,478 raw units** of asset 0.
Its initial root and eight events were identified, but its proposed final high
endpoint lay inside `rho < sigma`. A diagnostic scan found a feasible point
farther down the same proposal interval. The scan is retained as diagnosis and
is not a production search algorithm. [RED](mixed-pilot/reversal-red.txt),
[diagnosis](mixed-pilot/reversal-diagnosis.txt).

`LowerSheetProposal` instead uses exact untouched-coordinate moments to propose
the lower side of the excluded radial interval. It rounds the wide square root
up and the coordinate down. The endpoint caller uses it once, only after a
below/uncertain-sheet result for n>2, then rechecks full membership and strict
output price. Original-radical root signs, domain/critical-point checks, initial
release, both-root event order, connected arcs and final payout/retention remain
mandatory. The 160-refinement and 16-crossing ledgers are unchanged.

[Arithmetic derivation](../../docs/audits/LOWER_SHEET_PROPOSAL.md) and
[independent source review](../../docs/audits/LOWER_SHEET_REVIEW.md) establish
the proposal's scoped arithmetic claim and preservation of acceptance gates.
The review's pinned test files precede the supplemental tests below; its
production source hashes still match. This is a numerical implementation choice,
not a change to the paper's mechanism or a new trade certificate.

## Fresh verification

The exact supplemental oracle uses `Fraction`, pair differences and integer
bisection on the lower half-line, without the production discriminant or square
root. It agrees with exhaustive enumeration for 625 small n4 inputs and emits
47 Solidity cases across n2..8: unequal untouched coordinates, 64-/191-bit
scales, exact sheet equality, already-lower points, caller limits and no-gap
deferrals. The Solidity helper matches every accepted integer ceiling exactly.
Equal-coordinate fuzz remains separately scoped; the run reports 257 iterations
because it replays a retained cached case in addition to the configured 256.

The complete default Solidity run passes **398 tests in 46 suites**, seed
`0x20260908`, fuzz 256 and invariants 32×64 with unexpected reverts forbidden.
No source/configuration input changed. Runtime was 511.885 seconds including
349.93 seconds compilation. All **129 reference regressions** pass in 53.508
seconds. The new reversal test is bound to the retained reference literals and
asserts exact reserves, output, inward/outward order, phase counts and budgets.
[Frozen contract checkpoint](mixed-pilot/contracts.json),
[contract output](mixed-pilot/contracts.txt),
[reference manifest](mixed-pilot/reference-manifest.json),
[reference output](mixed-pilot/reference-tests-current.txt).

Fresh linked observations at one canonical block accept **68 interior +60 mixed**
actions, **42 inward +112 outward** frontier transitions, zero deferrals/reverts,
and all 32 histories. Exact raw output, actual reserves, support-gap bound,
root-enclosure containment, transition phases and shared work counters match.
The formerly failing reversal now matches 7,478 with eight crossings.
[Promotion observations](mixed-pilot/promotion.json),
[transcript](mixed-pilot/promotion.txt),
[validated computation manifest](mixed-pilot/promotion-manifest.json).

The driver deploys only two linked libraries and a test harness on an owned
disposable Cancun Anvil. It authenticates source closure, constructor simulation,
linked runtimes and mined deployment receipts, uses hash-pinned canonical calls,
rechecks code/source/block identity, verifies observations mine no blocks and
closes the node. It accepts no external RPC or signing configuration. Five
comparison-boundary mutation tests are retained separately; they are not the
required engine mutation campaign. The preliminary baseline driver completed
observations but used an incorrect final RPC method and is retained as a failed
runner, not verified evidence.

SDK compiled-artifact provenance was regenerated; all 76 SDK tests and workspace
TypeScript checks pass. No frontend presentation or workflow was changed.

## Gas and source boundaries

| Observation | Gas / bytes | Meaning |
| --- | ---: | --- |
| n3/t8 recovered reversal | 9,273,037 gas | Diagnostic inner dispatch |
| n8/t8 concentrated step1 | 14,225,862 gas | Diagnostic inner dispatch |
| n8/t8 concentrated step2 | 18,368,590 gas | Largest pilot observation |
| n8/t8 concentrated step3 | 17,623,174 gas | Diagnostic inner dispatch |
| Existing n3/three-tick first/reverse actual settlement | 5,167,894 /5,834,667 gas | Cold external Router/Aqua call; intrinsic/forwarding margin excluded |
| Router / Storage / Settlement | 22,221 /23,240 /6,658 bytes | Current compiled runtimes |
| Composition / Endpoint | 23,138 /22,826 bytes | Current linked runtimes; endpoint +368 bytes |

[Settlement gas record](mixed-pilot/gas.json), [transcript](mixed-pilot/gas.txt).
The first gas wrapper expected seven emitted runtime values; the existing test
emits its five engine/storage runtimes. That wrapper assertion was corrected
and the single benchmark rerun; [preliminary output](mixed-pilot/gas-preliminary.txt)
is preserved. The contract assertion itself passed in both runs.

All named runtimes fit EIP-170. Diagnostic gas includes harness metadata work,
but excludes complete Aqua settlement, fees, storage and transaction intrinsic
gas. Two observations already exceed the **provisional** Arc cap of 16,777,216;
step1 also exceeds its provisional 20% margin target. See the separately
recorded [Arc identity and limit observations](../../docs/ARC_DEPLOYMENT_STATUS.md).
No target gas acceptance or Arc deployment is claimed.

The baseline preserves 53 source pins in its own authenticated archive. The
promotion preserves 638 actual source/configuration inputs, including reference
and contract test closures, in a separate
[archive](mixed-pilot/promotion-source-snapshot.tar.gz) and
[pin list](mixed-pilot/promotion-source-pins.json). Frozen run transcripts and
records remain valid when repository-wide current-run files advance. Dependencies
and Solc/Foundry/Node/Python versions are explicit replay prerequisites; these
archives do not contain installed binaries or all build artifacts.

For a current replay, run `python packages/reference/fixtures_lower_sheet.py`,
`python scripts/audit-contracts.py`, `python scripts/audit-reference.py`,
`node test/evidence/mixed-pilot/observe-promotion.mjs`,
`python test/evidence/mixed-pilot/gas.py`, then
`python test/evidence/mixed-pilot/promote.py`. Regenerating the complete unchanged
high-precision pilot uses `python test/evidence/mixed-pilot/generate.py` separately.
Historical baseline replay requires its archived source in an isolated checkout;
do not run the baseline writer against this promoted engine and relabel it.

General equality/discovery liveness, broader mixed economic/invariant/mutation
histories, reachable adversarial examples, full transaction gas and all live
Privy/Arc requirements remain open. The next gas investigation should measure
stage costs of these named n8 cases, preserving every certificate obligation.

Final mathematical self-review covered the new proposal document and this
ledger's notation, domains, bounds and source links. Routine edits: none.
Mathematical-token changes: none. Unresolved local notation issues: none.
Validation: independent source review, exact/finite checks and authenticated
manifests above; this proofreading step makes no additional proof claim.
