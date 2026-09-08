# Payment review, signing and recovery

Verified locally on 2026-09-08. The current frontend template is retained. This increment implements direct-USDC and swap-funded invoice payment through the shared wallet boundary; it does not establish a live Privy wallet, Arc deployment or complete application release.

## Implemented behavior

The SDK decodes the canonical payment observation, reconstructs its intent and exact calldata, and freezes the resulting draft. A separately supplied wallet/RPC port checks the current selected account and chain, canonical invoice terms, adapter bindings, decimals, token balance and allowance. Exact approval and payment are independently simulated without state overrides. The review carries its gas limit and EIP-1559 fee caps; increased estimates, changed terms/funding/allowance or stale observations require another review. Arc USDC input reserves `raw amount × 10^12` native units in addition to gas because its ERC-20 and native views share one balance.

The invoice controller requests a fresh quote for each explicit review. Approval confirmation never signs a payment; the user requests a new quote and separately confirms payment. Reviews are single-use. Changing account, chain, input, invoice availability or deployment permanently invalidates unsigned work, including a change away and back to the original account. No presentation component constructs calldata or chooses a spender.

Submitted hashes and public expected transaction fields are scoped by chain, payer and invoice in local storage before waiting for the receipt. Storage failure retains the hash in the current UI. A reload can resume public receipt tracking without another signature. Confirmation checks the queried/returned transaction hash, transaction/receipt block, payer, target, calldata, value and canonical block. Reverts retain their hash and actual receipt gas. A successful transaction does not overwrite the separately validated indexed invoice status; settlement details remain receipt-backed API data.

## Final checkpoint

Run `python scripts/audit-payment-ui.py` with Node/pnpm/Docker prerequisites from the README. The runner streams bounded command transcripts, owns timeout cleanup and freezes 708 authored source/configuration/fixture inputs before and after all commands. Next-generated `next-env.d.ts`, build caches, installed dependency bytes and external runtime state are explicitly excluded. [Exact inputs, commands, hashes and terminal statuses](payment-flow/checkpoint.json).

| Check | Result | Evidence |
| --- | --- | --- |
| Complete SDK suite | 100 passed, zero failed/skipped/cancelled; 20.040s TAP duration | [Transcript](payment-flow/sdk.txt) |
| Complete shared suite | 7 passed, zero failed/skipped/cancelled | [Transcript](payment-flow/shared.txt) |
| Complete Chromium fixture suite | 31 passed; 126.779s runner time | [Transcript](payment-flow/browser.txt) |
| Production frontend build | Passed; all documented routes compiled; 62.879s | [Transcript](payment-flow/build.txt) |
| Workspace TypeScript | Passed; 61.188s | [Transcript](payment-flow/types.txt) |

The eight new SDK tests cover immutable reconstruction, live invoice/adapter/funding failures, separate approval/payment review, gas and account revalidation, Arc shared USDC funding, storage/receipt interruption and expiry at the final identity boundary. Twelve new browser tests extend the previous nineteen: direct approval→fresh quote→payment, swap-funded payment calldata, insufficient gas, rejected signatures, account/chain changes including return to the original account, expiry, reverts, mismatched transaction bytes/hash, reload recovery, storage failure and a hash returned after an account change during signing.

The [320px approval](payment-approval-mobile.png) and [desktop payment review](payment-review-desktop.png) were visually inspected. Essential amounts, recipients and actions remain visible without horizontal overflow. The inherited public invoice and standalone swap screenshots were refreshed by the full suite. Browser fixtures use an empty Privy app ID and synthetic native RPC responses; their receipts are not mined financial evidence. The synthetic confirmed-transaction test deliberately keeps the API invoice unpaid to verify that the UI does not invent settlement status.

## Retained failures and limits

[Preliminary notes](payment-flow/preliminary-notes.md) retain the missing-module red stage, assertion/type corrections, navigation-sensitive fixture failure, initial 30-test checkpoint, and two reproduced behavioral gaps. [The two failing regressions](payment-flow/edge-red.txt) and pre-fix source copies are retained. Both pass in the final 31-test suite. Initial checkpoint transcript paths reflect their original location; their exact copies are now under `payment-flow/initial-checkpoint/`.

API production code, Solidity and mathematical implementation were unchanged. Their earlier 210 API, 398 contract and 129 reference checkpoints retain their own source/run boundaries; none was rerun here. The final suite does not close numerical equality/discovery/economic/gas obligations, persistent demo deployment, live Privy/Arc wallet tests, replacement-transaction discovery, full accessibility/cross-browser/performance campaigns, strategy publication, invoice creation/cancellation or standalone swap execution. Provider-controlled wallet UI may let the user edit a transaction; these tests verify Orbital's exact requests and subsequent receipt matching, not control over every wallet's interface.
