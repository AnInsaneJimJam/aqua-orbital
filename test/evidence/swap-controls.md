# Swap settings, balances and Max

Implemented locally on 2026-09-08 within the retained frontend template. This extends the [reviewed swap workflow](swap-flow.md); it does not establish hosted Privy behavior, mined browser transactions or mathematical release acceptance.

## Implemented behavior

The default pair is USDC to oUSD6 with a blank amount. Slippage defaults to 10 basis points; presets are 10/50/100 and custom values require an integer from 1 through 500. Values above 100 show a high-slippage warning. Deadline choices are 60/180/600 seconds, defaulting to 180. Device storage contains only these settings. Reset restores defaults; invalid settings prevent quoting and review, and storage failures have explicit messages. A settings change permanently invalidates an unsigned review and the new limits enter canonical SDK calldata.

Valid amount edits debounce for 300ms. Visible observations refresh after ten seconds while the tab is active; refresh pauses during review, signing, receipt display and Max estimation. A quote's informational display expires at its source block timestamp plus twenty seconds. The SDK's existing ten-second indexed-source admission and review checks remain unchanged: the displayed quote cannot authorize a signature, and every review obtains a fresh response. Refresh failure clears the old amounts; superseded requests cannot repopulate another input, wallet or settings context.

The balance port checks the configured deployment and wallet network, reads the selected token's balance and decimals at one canonical block hash, verifies the block again, and bounds its age to twenty seconds. Context changes, inconsistent precision, reorgs and RPC failures expose unavailable data. Max refreshes the balance before choosing an amount; missing balances are never replaced by zero.

On Arc, USDC Max starts with a 50,000-raw-unit reserve (0.05 USDC). It obtains a quote and simulates that candidate through the same live review checks, then reserves `max(50000, 2 * ceil(remainingGasNative / 10^12))` raw USDC units. A higher estimate reduces the candidate and requires another simulation of that smaller amount; the reserve never shrinks. Three estimates bound this process, and an unverified final candidate is rejected. This is a conservative gas-based input estimate, not a proof of an economic optimum or future gas cost.

If token approval is still needed, the future swap cannot be simulated without that actual allowance. The implementation does not supply a state override or pretend the approval estimate covers both actions. It reports unavailable remaining gas and offers an explicitly editable balance-minus-0.05-USDC amount, labeled as possibly needing a larger reserve. Exact approval, fresh swap review and final funding checks still follow. Gas is not deducted from unrelated token balances. Timeout or context changes cannot silently change the input or submit a transaction.

The normal network action requests the configured chain through the active wagmi connector. Rejection keeps the editable amount and cannot quote or sign on an unsupported chain. Quote detail includes the selected maker, tick count, fixed sixteen-crossing cap and strategy link. Presentation continues to receive typed state/callbacks and does not choose spenders or construct calldata.

## Verification

`python scripts/audit-swap-controls.py` runs complete SDK/shared/Chromium/build/type checks with frozen authored inputs and streamed, bounded transcripts. Its [checkpoint](swap-controls/checkpoint.json) is accepted only after every command exits successfully and the inputs remain unchanged.

The final checkpoint is accepted with **731 unchanged authored inputs** across all five commands. [Staged-byte verification](swap-controls/staged-verification.json) matches 755 source, transcript and artifact bindings without discrepancies.

| Check | Result | Evidence |
| --- | --- | --- |
| Complete SDK suite | 114 passed, zero failed/skipped/cancelled; 16.671s TAP duration | [SDK](swap-controls/sdk.txt) |
| Complete shared suite | 7 passed, zero failed/skipped/cancelled | [Shared](swap-controls/shared.txt) |
| Complete Chromium/storage suite | 56 passed; 113.643s runner time | [Browser](swap-controls/browser.txt) |
| Production frontend build | Passed; 47.056s | [Build](swap-controls/build.txt) |
| Workspace TypeScript | Passed; 47.733s | [Types](swap-controls/types.txt) |

The refreshed port-3002 preview served `/swap` and all 22 referenced assets successfully. [Public HTTP check](swap-controls/preview.json). No authenticated wallet action was performed.

Four new SDK tests cover all supported settings, exact large balances and native conversion, candidate re-estimation and unavailable/unstable gas. Twelve new browser checks cover defaults, saved settings and review invalidation, invalid values, debounce, both Max inventories, unknown gas, bad balance/precision, network selection/rejection and Max interruption. The previous 44 browser/recovery checks remain required. The updated expiry test observes a changed output after the ten-second refresh, waits for that response to complete, then checks hidden-tab expiry and reactivation.

The [320px settings view](swap-controls-mobile.png) was visually inspected. Open settings, long balances and controls remain usable without horizontal overflow. These fixtures use synthetic RPC/wallet data and an empty Privy app ID; they are not live financial evidence. [Preliminary failures and corrections](swap-controls/preliminary-notes.md).

## Remaining scope

Transaction replacement discovery, standalone receipt explorer links and the complete route classification/availability panel remain open. Strategy publication, invoice administration, persistent demonstration, live embedded-wallet/Arc verification and full accessibility/cross-browser/performance campaigns remain outstanding. Contract and numerical production code were unchanged; their prior 398-contract/129-reference checkpoints and unresolved equality/discovery/economic/gas obligations retain their own boundaries. No new API runtime campaign is claimed.
