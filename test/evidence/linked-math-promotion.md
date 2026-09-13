# Production pure-library visibility promotion

After the two independent reviews of the
[isolated proposal](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/LINKED_MATH.md), production changes were
limited to exactly five `internal` → `public` visibility keywords:
`FrontierComposition.certify` and `FrontierEndpoint.identifyInitial`,
`exactInput`, `exactInputForPayout`, `resumeExactInput`. Normalizing those five
keywords recovers the pinned source hashes; no arithmetic, body, parameter,
predicate, budget, range, rounding or router/storage behavior changed.

New `LinkedMath.t.sol` tests preceded the promotion. Before promotion,
**six tests failed** because the constructed consumer's inlined runtime was
30,446 bytes; two existing-semantics error/purity checks passed. After promotion,
**all 121 focused tests pass across ten suites**, with zero failures/skips,
seed `0x20260908`, 141.97s compilation and 2.75s suite runner time. The observed
pre-suite timestamp is `2026-09-08T06:49:08.988684Z`; a separate command-start
timestamp was not captured.

The eight new tests verify actual compiler-linked C and E calls, a constructed
consumer, runtime limits, n2/n3/n8 outputs, both-root traversal, successful
retained-bracket fallback, the shared ledger, unchanged input arrays, repeat
results, caller-storage isolation, and distinct errors/uncertified statuses.
Recording EVM storage accesses detects zero writes to the consumer across
nested pure calls. The prior 113 root/endpoint/release/schedule/turn/payout,
composition and gas tests still pass, including 256 scaled wide-square fuzz
cases and 257 cases each in the existing root/turn entries.

| Actual runtime | Bytes | Headroom under EIP-170 |
| --- | ---: | ---: |
| FrontierComposition | 22,253 | 2,323 |
| FrontierEndpoint | 18,327 | 6,249 |
| New linked test consumer | 3,027 | 21,549 |

Composition has four compiler link references to Endpoint; Endpoint has no
external library dependencies. The consumer calls Composition using generated
linkage. Router, OrbitalStorage, settlement, SDK public deployment identity and
network manifests remain unchanged. Those linked library identities must be
verified when the final deployment graph is actually integrated/deployed.

The new consumer measures cold linked addresses and includes caller ABI/call/
return work, excluding fixture/assertion/log and transaction intrinsic costs:

| Named path | Cold external gas | Linked body gas | First / resumed / remaining |
| --- | ---: | ---: | --- |
| n2 mixed | 5,866,745 | 5,855,209 | 65 / 0 / 95 |
| n3 mixed, three ticks | 7,104,106 | 7,091,234 | 60 / 0 / 100 |
| n8 mixed, three ticks | 11,581,313 | 11,565,971 | 60 / 0 / 100 |
| n2 two roots | 6,193,924 | 6,181,217 | 70 / 0 / 90 |
| n2 order fallback | 9,745,956 | 9,733,249 | 63 / 62 / 35 |

Each named helper is tested against the documented provisional 13,421,772-gas
planning ceiling. This ceiling applies to these helper fixtures and is not a
claim about complete swaps or the unverified Arc transaction cap. The n8 case
has three ticks, not the required eight-tick worst accepted traversal. EIP-150
forwarding, router/state/fee/settlement and intrinsic costs remain outside this
acceptance statement; the default two-million-gas benchmark remains separate.

The existing gas harness also passes with public linking. Its n8 external call
measures 11,587,472 versus the pre-linking 16,735,765; n3 is 7,110,352 versus
8,953,766, and successful fallback 9,752,262 versus 13,760,398. These differ
slightly from the new consumer because the wrappers/ABI and access setup differ;
they are not interchangeable samples of one identical call site.

The isolated exact-result comparisons and normalized-source pins support the
call-boundary change. Immutable strategy coefficient/decimal provenance,
verified static library code/links and every existing mathematical theorem
remain hypotheses. Public pure results are conditional computations, not
external bearer proofs or settlement authority. No new supported-range,
reachable-history, cycle/mutation or full-gas claim is made.

Reproduce from `packages/contracts`:

```text
forge test --match-contract '^(LinkedMathTest|PayoutBracketTest|PayoutEndpointTest|RootBracketTest|FrontierEndpointTest|FrontierCompositionTest|FrontierCompositionGasTest|SlackGridReleaseTest|FrontierScheduleTest|FrontierTurnTest)$' --fuzz-seed 0x20260908 -vv
```

The [promotion manifest](math-linkage/promotion-manifest.json) records current
source/config/test hashes and artifact identities for this checkpoint. The
earlier [isolated manifest](math-linkage/manifest.json) remains a historical
pre-promotion record; its original visibility hashes are intentionally retained.
