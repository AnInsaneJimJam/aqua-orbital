# Standalone swap review and receipt recovery

Implemented locally on 2026-09-08 using the existing frontend template. This increment connects standalone Orbital swaps to the shared wallet boundary. Synthetic browser receipts do not establish a live Privy wallet, deployed Orbital instance or Arc financial flow.

## Behavior

An explicit review fetches a new validated quote and constructs immutable SDK calldata. At one canonical live block the wallet port checks strategy configuration/version, lifecycle status, all-token Aqua backing/availability, output funding, payer balance/allowance, token decimals and an exact router quote. Partial fills or output below the reviewed minimum fail. The exact approval or swap is simulated without state overrides, and native funding must cover the reviewed gas/fee limits plus Arc USDC input from its shared inventory.

Approvals target only the router for the exact gross input. Their confirmation requires a fresh quote and separate swap review/signature. Reviews are single-use and repeat state, canonical block, wallet, allowance-stage and gas-budget checks before signing. Account/input/deployment changes invalidate unsigned work permanently, including an account switch away and back.

Public recovery records use separate chain/account/hash keys. Reload recovery verifies the canonical transaction against its saved account, target, calldata and value without signing again. Both swap and approval calldata are independently reconstructed when decoding saved records. Corrupt records block further signing; storage failure after submission keeps the hash in memory.

`Swap complete` additionally requires exactly one canonical `OrbitalSwapExecuted` event from the expected router. Its maker/order, taker/recipient, pair, exact input/net/fee, minimum output, later version, and ordered crossing metadata must match the intent. Missing/duplicate/malformed events leave receipt recovery unresolved. Displayed output and fees come from that event, gas comes from the receipt, and a revert never exposes successful swap amounts. Old quoted output is hidden during review and receipt display.

## Verification

The complete acceptance run is recorded by `python scripts/audit-swap-ui.py`. Its [checkpoint](swap-flow/checkpoint.json) binds authored SDK/shared/web/API configuration and test inputs, exact commands, transcript hashes and terminal statuses. Next-generated declarations, build caches, installed dependency bytes and external runtime state are explicitly excluded. Only `accepted:true` with unchanged inputs establishes this checkpoint.

The final checkpoint is accepted with **721 unchanged authored inputs** across all five commands. [Staged-byte verification](swap-flow/staged-verification.json) checks 745 source, transcript and artifact bindings with no mismatches.

| Check | Result | Transcript |
| --- | --- | --- |
| Complete SDK suite | 110 passed, zero failed/skipped/cancelled; 43.182s TAP duration | [SDK](swap-flow/sdk.txt) |
| Complete shared suite | 7 passed, zero failed/skipped/cancelled | [Shared](swap-flow/shared.txt) |
| Complete Chromium/storage suite | 44 passed; 251.087s runner time | [Browser](swap-flow/browser.txt) |
| Production frontend build | Passed; 95.872s | [Build](swap-flow/build.txt) |
| Workspace TypeScript | Passed; 85.473s | [Types](swap-flow/types.txt) |

The existing port-3002 preview was restarted after its old process served stale post-build asset references. The new process served `/swap` and every referenced asset successfully. [Public HTTP observation](swap-flow/preview.json). This does not exercise authenticated Privy behavior.

The focused browser run passed thirteen checks: approval followed by fresh swap, insufficient shared native inventory, docked/changed-version strategy, rejected signature, absent settlement event, reload recovery, review expiry, account switch away/back, revert, corrupted approval recovery, canonical stored calldata and recovery scope/precision. [Transcript](swap-flow/focused-browser.txt). Two direct storage checks run in the same Playwright suite; they do not open a page.

Ten new SDK checks cover review identity/funding/expiry/gas and strict receipt decoding. Existing payment and public observation regressions remain required after extracting the common RPC execution port. [Retained failures and preliminary observations](swap-flow/preliminary-notes.md).

The [320px review](swap-flow/swap-review-mobile.png) and [desktop actual receipt](swap-flow/swap-receipt-desktop.png) were inspected for readable amounts, recipient, minimum, gas, transaction and crossing information. The fixture deliberately uses a very large input and an output differing from its quote by seven raw units. These images use synthetic wallet/RPC data; the lifecycle fixture is not a numerical witness.

## Remaining requirements

This checkpoint does not complete G6. The existing pair/slippage defaults still need reconciliation with the master specification; editable persisted settings, balance/Max controls, automatic quote refresh, replacement transaction discovery and explorer links remain open. Strategy publication, invoice administration and the integrated demonstration remain separate work. Full keyboard/accessibility, cross-browser and production performance campaigns are outstanding.

The shared receipt port currently rejects a changed transaction hash and retains recovery state. It does not yet follow repriced, cancelled or differently replaced transactions. Provider-controlled wallet UI can alter submitted transactions; Orbital verifies its requested plan and the returned canonical transaction, rather than claiming control over every wallet's interface.

API production code, contracts and mathematical implementation were unchanged. Earlier 210 API, 398 contract and 129 reference checkpoints retain their own source/run boundaries. No numerical equality/discovery/economic/gas obligation, live embedded-wallet creation/signing, Arc identity or sponsor qualification is closed here.
