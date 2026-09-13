# Evidence index

This directory retains reproducible contract, reference, backend and deployment evidence.
Each record identifies its source revision, commands, observed results and limits. Historical
results are not a claim that the current checkout was retested or independently audited.

## Contracts and settlement

| Evidence | Recorded scope |
| --- | --- |
| [Complete engine suites](engine-suite/README.md) | 404 contract tests across 47 suites and 129 reference tests passed at the September 9 checkpoint. |
| [Integration smoke](engine-basic/README.md) | Eight cases covering quotes, six directed pairs, mixed paths, invoices and rollback. |
| [Custom fee instruction](fee-instruction.md) and [upstream regression](upstream-regression.md) | Once-only fee accounting and comparison of the preserved SwapVM behavior. |
| [Settlement security](router-settlement-security.md) | Exact transfer deltas, mined failures and recovery. |
| [Mixed execution](mixed-execution.md) and [mixed invoices](mixed-invoice.md) | Initialized crossings, raw payouts, recipient splits, refunds and atomic rollback. |
| [Stateful accounting](interior-stateful.md) and [shared inventory](shared-inventory-mixed.md) | Bounded accounting histories with explicitly stated makers, paths and source graphs. |
| [Artifact integrity](artifact-integrity.md) | ABI, bytecode and deployment-source authentication. |

## Mathematics and reference model

- [Numerical contract and limits](numerics.md), [interval arithmetic](interval-math.md) and [independent initializer](initializer-oracle.md).
- [Curve primitives](curve-primitives.md), [root brackets](root-bracket.md) and [global support certificates](dual-certificate.md).
- [Frontier composition](frontier-composition.md), [payout refinement](payout-refinement.md) and [reachable traversal](reachable-traversal.md).
- [Selected-token profiles](selected-token-profiles/README.md): bounded initializer and token-basket comparisons.
- [Reference run manifest](reference-audit/manifest.json) and [retained results](reference-audit/tests.txt).

These are conditional component arguments and finite computations; their stated domains
and exclusions remain part of every result.

## Backend and SDK

- [API readiness](backend-api.md), [reorg handling](backend-reorg.md), [materialization](materialization.md) and [swap projection](swap-materialization.md).
- [Strategy reads](strategy-reads.md), [invoice reads](invoice-reads.md) and [receipt-derived metrics](metrics.md).
- [Route selection](route-selection.md), [swap quote service](quote-service.md), [payment quotes](payment-endpoint.md) and [bounded cache](quote-cache.md).
- [SDK plans](sdk-plans.md), [event decoding](sdk-events.md) and [quote decoding](quote-read-sdk.md).

Backend observations are read-only. Quotes do not authorize signatures or guarantee future settlement.

## Deployments and financial receipts

- [Arc deployment verification](../../deployments/5042002/verification.json): twelve successful deployment transactions, runtime identities and bindings.
- [First Arc strategy](arc-integration/first-strategy.md), [swap receipt](arc-integration/first-swap.json) and [swap-funded invoice](arc-integration/first-payment.json).
- [Offline receipt association](privy-association-basic/README.md): signed-transaction, sender, event and transfer matching; wallet-provider identity remains unverified.
- [Local deployment](local-deployment.md) and [local integration](local-integration.md): Anvil receipts, application flows and persistence recovery.
- [Arc index freshness](arc-integration/index-freshness.md) and [provider recovery](arc-integration/provider-recovery.md).

Arc uses a project deployment of upstream AquaRouter. Local fixtures remain distinct from
Arc receipts; neither transaction signatures nor a login screen establish Privy provenance.

## Remaining scope

General solver liveness, full supported-range gas acceptance, broader economic and security
campaigns, mutation coverage and authenticated Privy wallet association remain open.
See the [recorded release-gap review](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/audits/RELEASE_GAP_REVIEW.md).

Superseded frontend reports and captures were removed. Necessary historical references use
immutable GitHub links; retained manifests preserve the scope of the original observations.
