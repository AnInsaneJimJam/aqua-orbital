# Receipt recovery after a verified RPC change

Reviewed and checked 2026-09-08 UTC.

Funding and strategy administration stored complete deployment manifests with pending transactions. Their receipt-resume paths previously compared the entire saved/current manifest, so changing only the verified public RPC URL prevented recovery of an already submitted transaction.

`validateReceiptRecoveryDeployment` in the shared SDK now parses both complete manifests and requires both to be verified and identical in every field except `rpcUrl`. Funding and strategy receipt recovery use it before querying the existing transaction hash through the currently configured public client. Explorer URL, chain, contract roles, start block, token metadata and ordering remain part of the comparison. No pending hash or saved plan is replaced, and receipt transaction/log/canonical checks still apply. New reviews and submission retain their full manifest equality checks.

Verification:

- `pnpm --filter @orbital/sdk exec tsx --test --test-name-pattern "receipt recovery permits only" test/execution.test.ts` — **1/1 passed**. The regression accepts only a valid RPC URL change and rejects unverified, malformed and altered deployment identities.
- `pnpm --filter @orbital/web typecheck` — **passed**, run once after the edit.
- Scoped `git diff --check` — **passed**.

Read-only review found no equivalent provider-only block in swap/payment receipt resume, invoice administration receipt resume, or saved publication reconstruction. The runner's explicit RPC override is verified against the historical receipts, runtime and bindings before an ignored runtime manifest is written; API and browser funding clients use that selected URL. Historical deployment evidence remains unchanged.

These checks do not demonstrate a live faucet claim, interrupted wallet recovery, Privy authentication or signing. No browser, transaction or broad suite was run for this change.
