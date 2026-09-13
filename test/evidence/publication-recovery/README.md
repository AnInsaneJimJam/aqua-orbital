# Publication recovery — 2026-09-13

Wallet `0x75922d18DdEe8f5413e80884B6B7d2f8f16b2309` reported a missing strategy and unavailable swaps. Read-only checks found that only the token approvals had completed. The selected-token calculation and index were not responsible for the missing activation.

- USDC approval: `0x1f659644a887cb80cf29024f91b9754c12f5398b71cdbd49b1f839ce2d52bc93`.
- oUSD6 approval: `0xa9e032e77a4c768c58f47b25f3ee1f3b2759bce78d29544e2d9d8e8d2e3c9195`.
- The public explorer returned four wallet transactions: two faucets followed by those two approvals, all successful. RPC reads observed transaction count 4, maker nonce 0, and Aqua allowances of 120 USDC / 120 oUSD6 / 0 oUSD18 (at approximately block 61899993).
- `/makers/<wallet>/strategies` and `/makers/<wallet>/shipments` both returned HTTP 200 with empty item arrays. `/strategies` was also empty in the current test view (start block 61860436).
- A read-only 1-USDC-to-oUSD6 quote returned `NO_ROUTE_IN_INSPECTED_SET`, with zero scanned/eligible candidates, at block 61900682. A preliminary readiness request sometimes returned `INDEXER_CHANGED`; the canonical strategy and quote reads succeeded and established the absence independently.

The UI omitted saved drafts before Aqua emitted a shipment receipt. A user could finish approvals, return to Liquidity, see an empty list and reasonably mistake approval confirmation for complete publication.

The fix shows a wallet/deployment-scoped saved-publication card before shipping, reuses the exact draft validator used by publication recovery, and checks the maker nonce so completed drafts disappear. It labels approval, publication and activation separately and gives explicit continuation actions after approval/shipping. No transactions were signed, sent or automatically retried; the owner must still publish and activate in their wallet.

The existing browser recovery test was extended to reproduce the missing card, failed at that assertion ([before](browser-before.log)), then passed after the fix ([after](browser-after.log)). It verifies selected-pair restoration, legacy three-token drafts, hiding after the maker nonce advances, and hiding on wallet change. Two existing registry/filter/pagination tests also passed. Web type checking and the isolated [production build](build.log) passed. Reproduce:

```sh
cd apps/web
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome node node_modules/@playwright/test/cli.js test liquidity-tokens.spec.ts strategy.spec.ts --grep 'publication preserves|owner listing|listing pagination'
```

These checks establish the recovery UI and the observed incomplete-publication state, not a completed user-signed Arc strategy. The signed steps and a swap by a different wallet remain owner actions.

## Subsequent activation and self-trade diagnosis

The owner subsequently completed activation in transaction `0x8e476983c3f2c66488f736152baa2b7cdbbbb76afc2725729340657933a12492` at block 61902363. Strategy `0x7a4f0af9979164ec7b05a164e3a19cc3845fe61308ac2b13a55d61539f4fe96e` is indexed as active, with 30 units each of USDC, oUSD6 and oUSD18 and a 500-ppm fee. Maker nonce is now 1.

The owner confirmed they were trying USDC → oUSD6 from the same maker wallet. [Read-only quote comparisons](trade-quotes.json) isolated the cause: the maker request returned `SETTLEMENT_ROLE_CONFLICT`; a separate synthetic address received a quote of 999163 raw oUSD6 for 1000000 raw USDC from that exact strategy. This is a historical quote observation, not a signed swap or a guarantee of current execution.

The swap page previously hid that diagnostic behind the generic no-route message. It now explains self-trading when every candidate has the settlement-role conflict. Other absence/outage states retain their original messages; contracts and routing exclusions are unchanged.

The existing absence/outage browser test first failed on the missing explanation, then passed after the change. That test and the wallet/chain invalidation test passed (2/2), along with web type checking. [Before](self-trade-before.log), [after](self-trade-after.log).
