# Automatic invoice input — 2026-09-09

The payer chooses a token and receives a read-only amount calculated by the existing bounded invoice quote API. The current token balance bounds the search; an optional advanced limit can lower it. The invoice's USDC terms remain fixed. Only the quoted transaction input can be approved, and payment requires another explicit review/signature. This changes frontend orchestration and presentation, not contracts or the solver.

## Focused verification

- `node packages/sdk/node_modules/tsx/dist/cli.mjs --test apps/web/checks/payment-limit.test.ts`: **2 passed**. Automatic/custom bounds, exact bigint precision and invalid bounds. The root `pnpm exec tsx` shorthand is unavailable; the command uses the existing SDK-local dependency.
- `pnpm --filter @orbital/web exec playwright test payment.spec.ts --grep 'exact approval is|swap-funded invoice reviews|automatic direct payment|insufficient native funds' --reporter=line`: **4 passed**. Automatic USDC and oUSD6 amounts, read-only output, optional limit invalidation/reset, no signature during calculation, exact approval followed by separately reviewed payment, local calldata reconstruction, and insufficient gas rejection.
- `pnpm --filter @orbital/web typecheck`: **passed**.
- Inspected the [320px approval](approval-mobile.png) and [desktop payment review](review-desktop.png); visible amounts, disclosures and actions fit without horizontal overflow.

The first helper run failed because its module was not implemented yet. The first typecheck found missing query-result inference; an explicit query result type fixed it before the passing check. Browser fixture time now starts before navigation because calculation starts automatically after connection. Screenshots use synthetic amounts and wallet/RPC fixtures; their dates are fixture dates. No new live signature was requested or submitted during these checks. Existing Arc/local services were left running. Broad release campaigns remain deferred.

Separately, the user's already-submitted [first live swap-funded invoice](../arc-integration/first-payment.json) was verified read-only: 0.5 oUSD6 produced 0.500507 USDC, paid 0.5 USDC to the merchant and refunded 0.000507 USDC to the payer. That transaction predates this UI change and does not validate the new automatic calculation or establish Privy wallet provenance.
