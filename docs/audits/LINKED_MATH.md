# Linked pure math: isolated measured proposal

2026-09-08. This checkpoint changes generated copies under `.cache/math-linkage`
only. Production router, storage, library bodies and deployment manifests are
unchanged. The proposed next change is exactly five visibility promotions:

- `FrontierComposition.certify`: internal to public pure.
- `FrontierEndpoint.identifyInitial`, `exactInput`, `exactInputForPayout`, and
  `resumeExactInput`: internal to public pure.

The endpoint library is independently deployed and statically linked into the
composition library. A future authenticated caller links composition. Every
other math function stays internal; no context, callback address, validation
flag or new witness argument is added. This is the smallest tested split that
satisfies the isolated bytecode and eight-token cost objectives below.

## Existing production boundary

`OrbitalSwapVMRouter` already uses statically linked `OrbitalStorage` and
`OrbitalSettlement`. The current curve dispatch calls guarded storage-owned
`executeInterior`, which supplies immutable strategy reserves/ticks/decimals.
That dispatch remains unchanged in this proposal; it must not accept an
externally supplied mathematical certificate as authorization to mutate state.

Current local artifacts measure router runtime 21,919 bytes, storage 18,269,
and settlement 6,658. Their existing dependencies remain: router to storage
and settlement; settlement to storage; storage to order codec and initializer.
No conclusion about the bytecode of a later mixed storage integration follows
from these existing measurements. The new proposed math dependency graph is:

```text
authenticated storage caller -> FrontierComposition -> FrontierEndpoint
```

Public Solidity library calls use compiler-linked `DELEGATECALL`; internal
library calls are inlined, and memory arguments across a public call are
copied. Libraries' calling convention is compiler-specific, so Solidity's
generated linkage must be retained instead of hand-building library selectors.
[Solidity 0.8.30 libraries](https://docs.soliditylang.org/en/v0.8.30/contracts.html#libraries)

## Measurements

Both variants use Solc 0.8.30, optimizer 700, viaIR, Cancun and the repository
remappings. Sources, test area, output and compiler cache are isolated from the
production Foundry tree. No contract-size override is configured. A real small
quote-caller contract is constructed by the harness; every candidate linked
library's actual runtime length is checked against 24,576 bytes. The oversized
baseline is explicitly a failed deployment-size candidate, even though Foundry
can execute that experimental library in its test environment. The EIP-170
limit applies to each deployed runtime separately.
[EIP-170](https://eips.ethereum.org/EIPS/eip-170)

| Candidate | Deployed runtime bytes | Initcode bytes | Outcome |
| --- | ---: | ---: | --- |
| A: single public Composition | 30,363 | 30,393 | Fails size limit |
| B: Composition linked to Endpoint | 22,253 | 22,283 | 2,323 bytes of runtime headroom |
| B: Endpoint with four public methods | 18,327 | 18,357 | 6,249 bytes of runtime headroom |
| B: created quote caller | 2,958 | 2,984 | Below runtime limit |

B's Composition artifact has four 20-byte Endpoint link references; Endpoint
has no external library dependencies. The quote caller has one Composition
link reference. The placeholder addresses must eventually be fixed to actual
verified library deployments and included in source/build/link-code identity
evidence; none is a mutable runtime target or proxy.

The five path cases compare **every ABI-encoded result byte** with the original
internal implementation, including statuses, initial/final root bounds,
reserves, shortfall, transitions and both refinement phases. Those five tests
and the size test all pass for B. A passes the five equality tests but fails
its size test. No extra release/schedule split was run after B met this bounded
objective; variant C remains an unmeasured option in the generator.

| Fixture | A cold external gas | B cold external gas | B linked body gas |
| --- | ---: | ---: | ---: |
| n2 mixed, two ticks | 6,832,722 | 5,874,211 | 5,860,191 |
| n3 mixed, three ticks | 8,850,630 | 7,111,574 | 7,096,207 |
| n8 mixed, three ticks | 16,606,227 | 11,588,775 | 11,570,944 |
| n2 two-root path | 7,221,108 | 6,201,491 | 6,186,199 |
| n2 successful order fallback | 13,605,943 | 9,753,526 | 9,738,231 |

Inputs are built before measurement. The quote caller and all linked addresses
are explicitly cold before the call. External figures include caller ABI,
call and return decoding; body figures start after argument decoding and end
before return encoding. Fixture/assertion/log costs and transaction intrinsic
gas are excluded. The repeated root work moves into fresh Endpoint memory
frames, while only its returned certificate remains in Composition memory.
There is no reset of a live Solidity memory pointer and no geometry cache.

The n8 fixture remains three ticks, not the required eight-tick worst traversal.
The provisional 13,421,772 execution-planning ceiling leaves about 1.83 million
gas above the measured B n8 helper, before transaction/settlement overhead.
The Arc transaction cap remains unconfirmed, and this does not close the
20% target headroom, default two-million-gas benchmark, or complete-swap gate.
See [Arc deployment status](../ARC_DEPLOYMENT_STATUS.md).

## Calldata and call budgeting

The n8 quote-caller fixture has 1,444 calldata bytes, 408 nonzero, costing 10,672
under the 4/16-byte schedule. With the ordinary 21,000 intrinsic base this is
31,672 gas before execution. For n3 the payload is 1,124 bytes/320 nonzero,
costing 8,336; n2 is 836 bytes, with 5,600–5,756 byte gas in the measured cases.
These are the isolated quote wrapper's payloads, not the router's swap/order
calldata. [EIP-2028](https://eips.ethereum.org/EIPS/eip-2028)

If EIP-7623's floor applies on the target, the n8 payload's data tokens are
`1036+4*408=2668`, giving a 47,680-gas floor including the base. The measured
execution-plus-standard-calldata cost is far above that floor. This is a
conditional interpretation of the EIP, not Arc-specific activation evidence.
[EIP-7623](https://eips.ethereum.org/EIPS/eip-7623)

Nested library call data incurs encoding/copy/memory costs already included
in the measurements; it does not pay transaction calldata intrinsic gas again.
For n8/three ticks, standard static-field counting gives 1,156 bytes for
`identifyInitial`, 1,540 for either exact-input method, and 1,604 for resume,
including each selector. These methods carry original inputs and proposals;
they do not export or import a prepared root context. The EIP-150 63/64 rule
limits forwarded gas at each call. The mathematical 160-midpoint ledger is
unaffected by that EVM rule, and deployment/transaction validation must still
measure a sufficiently funded complete call chain.
[EIP-150](https://eips.ethereum.org/EIPS/eip-150)

## Proof and review obligations for promotion

Only call frames change. Endpoint builds a fresh copied fixed-point vector;
the original input and ticks are read, not mutated. Its final reserve vector
is returned explicitly. Initial GRID release and schedule remain inside
Composition, and their original-frame witnesses remain live across endpoint
calls. There is no relied-upon cross-call memory alias. Every root's prepared
geometry is still regenerated inside Endpoint, every proposed resumed bracket
is recertified, and all final M/canonical/extended-retention and complete arc
checks remain in their original order. The shared ledger still belongs to
Composition; public endpoint methods remain phase-local pure computations.

Public pure functions can be called directly for computation. Their results
are not bearer authorizations: immutable coefficient provenance remains a
caller obligation, and only the authenticated storage path may supply strategy
state and act on an internally regenerated outer certificate. No external
party can inject a result, event array or trusted context into that path.
Pure libraries must remain free of storage/transient-state access or arbitrary
external targets. Their static link addresses and actual code identities are
part of the eventual deployment trust boundary.

Root reviewed the generator, measurement and narrow boundary proposal without
finding a concrete defect. Independent backend review is recorded in the
associated evidence when complete. Before production promotion, retain the
entire ordinary/root/endpoint/path regression family and add actual linked
entry, runtime-size, gas, state-isolation and negative-status regressions. Do
not wire router/storage or update live deployment identities in that promotion.

## Reproduction and limits

Run from the repository root:

```text
python test/evidence/math-linkage/measure.py a
python test/evidence/math-linkage/measure.py b
```

The generator pins normalized source identity for the complete 13-file math
closure. It normalizes only the five named visibilities back to internal for
the historical baseline, so it remains usable after that precise promotion
and refuses unreviewed body changes. Platform newline conversion means the
baseline is **normalized-source-text equivalent**, not necessarily identical
source bytes. Actual generated-source hashes and compiled artifact hashes are
recorded separately; complete returned ABI bytes are compared exactly.

The result files and full logs are under `.cache/math-linkage/<variant>/`.
The durable generator, template, source pins and the computation manifest in
[linked-math evidence](../../test/evidence/linked-math.md) retain provenance.
These finite fixtures establish no universal liveness, reachable raw history,
eight-tick worst-case gas, linked mixed settlement correctness, or target-chain
deployment identity. No supported range or rounding condition was weakened.
