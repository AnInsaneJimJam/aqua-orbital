# Real Router/Aqua mixed execution

The production Router now invokes the certified interior probe and, only for its
two existing cap deferrals, the closed-input mixed composition. It accepts only
`FrontierPathCertified`. It continues to reject uncertain paths explicitly.

The new actual initialized sequence uses immutable, sorted tokens with 6/18/6 decimals, three
ticks with radii 100/200/400 whole units, and500 ppm input fees:

| Trade | Gross input | Net input | Raw output | Settled crossings |
|---|---:|---:|---:|---|
| token0→token2 | 350000000 | 349825000 | 164721797 | key1.5 outward |
| token2→token0 from the actual first payout | 500000000 | 499750000 | 513016094 | key1.5 inward, then outward |

The output literals match the separate 110/160-digit explicit supporting-basket
[reference](../../packages/reference/fixtures/reachable-traversal.json). The
test deploys real tokens with a bounded CREATE2 search to place the 18-decimal
token between the two 6-decimal tokens. It ships and activates a normal canonical
order; no Router storage or numerical result is injected. A separate new
reference test automatically binds both the pure and actual Router literals to
the same corpus.

The actual final prefix determines principal, exact sum and wide square sum,
interior radius, boundary key numerator, stored original sigma contributions and
interior suffix mask. Fees remain outside geometry and accrue once. Both mixed
fills end in prefix 1 with R 600 whole, K 150 whole×GRID, sigma lower/upper 50 whole,
mask 6, and cumulative input fees 175000/0/250000 after the second fill.

The complete release/frontier/retention crossing list is stored temporarily under
the existing global guard and current order hash. Quotes write no record. The
Router consumes and deletes it only after `Settlement.finish` verifies all
token, allowance and Aqua deltas; then it emits the unchanged keys/directions
event ABI and unlocks. Phase flags never authorize public input or extra payouts.
These actual sequence fixtures exercise ideal frontier crossings; retention
phases have separate pure evidence and are not claimed as a reachable Router
history by this fixture.

The new tests verify exact physical wallet/Aqua changes, metadata and principal,
static quote purity, correct ordered events, insufficient crossing allowance,
and a post-transfer recipient deficit that forces settlement rollback. After that
failure, a different maker's interior fill emits no crossings, and the original
maker's successful mixed retry emits the expected crossing. Read-only storage
checks verify guard, pending identity, array lengths and first packed array words
are cleared. No test writes Router storage. Existing six directed pair swaps,
256 real two-leg cycles and the real five-dollar 90/10 invoice regression pass.

Tests preceded behavior: 6 mixed Router tests and 2 probe deferrals failed with
`RequiresTraversal`. The combined RED also included 2 expected LocalUSDC fixture
failures owned by the SDK agent. The first implementation encountered an IR
stack limit; splitting private calculation and commit functions preserved the
checks and resolved compilation. Its first behavioral run passed 74/75, with only
the old lifecycle error assertion expecting the previous blanket traversal error.
That same uncertain fixture now asserts the exact typed uncertainty error and
unchanged state/lock behavior.

The final focused run passed 88 tests across 11 suites, 0 failures/skips, seed
`0x20260908`. The compiler took 86.35s and the runner 1.72s. Fee fuzzing reported 257
cases; raw-unit and actual-cycle fuzzing each reported 256. The new reference
literal binding passed 3/3. Raw logs, complete source closure hashes from compiler
metadata, graph links and commands are in the [manifest](mixed-execution/manifest.json).

| Measured actual external call | Gas |
|---|---:|
| First mixed swap | 5,166,603 |
| Reverse mixed swap | 5,833,358 |
| Maximum 8-token/8-tick activation | 3,791,206 |
| That maximum configuration's Aqua ship | 231,896 |

Swap measurements cool Router, linked libraries, Aqua and token addresses and
storage. They include call ABI, state writes, fee handling and actual settlement;
setup/assertions and transaction intrinsic gas are excluded. Activation uses real
sorted 18-decimal tokens, 7 ordinary keys and an anchor, bounded exact funding and
approval, and validates all backing, principal, wide moments and mask 255. Its
production coefficients construct the fixture, so it is an integration/gas check,
not an independent initializer oracle.

| Linked component | Runtime bytes | EIP170 headroom |
|---|---:|---:|
| Router | 22,221 | 2,355 |
| Storage/execution library | 23,240 | 1,336 |
| Settlement library | 6,658 | 17,918 |
| Composition library | 23,138 | 1,438 |
| Endpoint library | 22,458 | 2,118 |

The graph adds Storage→Composition→Endpoint to the existing Router→Storage and
Router→Settlement links; Settlement also links Storage, and Storage retains
Codec/Initializer links. Every runtime is below EIP170. Creation bytecode and
exact link offsets are recorded separately in the manifest. Library identity,
minimum EIP150 forwarded gas, worst-supported-configuration swap gas, target
network verification, full release campaigns and live Privy execution remain
separate requirements. Root and backend source reviews found no concrete defect
under immutable strategy/link provenance and the existing mathematical proofs.
