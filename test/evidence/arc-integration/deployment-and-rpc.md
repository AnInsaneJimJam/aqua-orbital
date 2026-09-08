# Arc activation and public RPC recovery

Observed September 9, 2026 (local time; raw timestamps use UTC). This is a light integration checkpoint, not release acceptance.

## Deployment

All twelve transactions in the owner-approved upstream-Aqua plan were signed by the user's wallet and succeeded. [The activation report](../../../deployments/5042002/verification.json) retains the canonical receipts, exact runtime identities, source/build fingerprint and immutable bindings. [The active manifest](../../../deployments/5042002/manifest.json) contains the deployed addresses and first deployment block, 61131616. The deployment gas total was 0.602264042268645568 testnet USDC.

The first activation attempt incorrectly expected a `bytes[]` return from upstream `multicall(bytes[])`. The pinned AquaRouter ABI declares no outputs. The verifier now requires the exact empty ABI result; activation then passed without redeploying or signing another transaction. The unchanged AquaRouter retains the deploying wallet as its helper/rescue owner; the custom Orbital router's owner is zero.

## RPC selection

The primary Arc endpoint returned HTTP 429 for both hash-pinned and one-block numeric-range log requests. Blockdaemon returned the same chain ID and deployment-start block hash and the expected first-block log. The endpoint is listed in [Arc's official RPC reference](https://docs.arc.io/arc/references/rpc-endpoints). [Raw diagnostic](../../../apps/indexer/test/arc-rpc-diagnostic.json).

The ignored root `.env.arc.local` explicitly selects `https://rpc.blockdaemon.testnet.arc.io` for `ARC_RPC_URL`, `NEXT_PUBLIC_ARC_RPC_URL` and `INDEXER_RPC_URL`. `dev:arc` completed `verify-active --rpc-url` through that provider before starting the API, indexer and web app. That verification repeats receipt, canonical-block, runtime and binding checks against the original signed plan and activation report. Only then does the runner derive `.cache/arc-runtime/manifest.json` with the selected read URL. Historical deployment artifacts and the wallet's signing plan remain unchanged. There is no automatic provider fallback.

Completed deployment pages stop automatic receipt/runtime polling. Manual refresh and activation still verify their normal prerequisites.

## Funding-page diagnosis

The reported `Balance: Unavailable` / `HTTP request failed` did not identify a failed faucet transaction. Read-only browser and installed-viem probes completed the funding controller's balance reads, four concurrent canonical faucet getters, exact faucet simulation, gas/fee estimate, native balance and canonical recheck. [Blockdaemon probe](funding-rpc-blockdaemon.json), [primary controller probe](funding-rpc-controller.json), [browser-origin probe](funding-rpc-origin.json).

At that observation the deploying wallet held zero oUSD6 and zero oUSD18, both cooldowns permitted a claim, and the oUSD6 faucet simulation estimated 90,835 gas. The observed native balance was 19.397735957731354432 testnet USDC. These are dated observations, not promised current balances. No authentication, wallet signature or transaction broadcast occurred in these probes. The exact cause of the user's particular failed HTTP request was not captured; intermittent primary-provider failures were reproduced elsewhere in the same session.

## Scope remaining

The actual-address public UI and Privy login choices load; [browser observation](deployed-ui.json). Indexer catch-up and readiness need separate live observation. These artifacts do not establish liquidity publication, an Orbital swap, an invoice payment, Privy embedded-wallet creation, sponsor qualification or mathematical/release acceptance.
