# Frontend: minimal workflows, editable design

## Authority

The master owns financial behavior and security. This document owns editable presentation defaults. Its visual guidance supersedes the old master’s exact layout measurements and scroll timeline; changing presentation does not authorize changing fee, custody, slippage, approval, or settlement behavior.

## Architecture

Use Next.js App Router, React, CSS Modules, Radix primitives, and the shared bigint SDK. Separate feature controllers (queries/state machines/actions), wallet integration (Privy/wagmi), and presentational components (typed state and callbacks). Presentation never assembles calldata, chooses an allowance spender, or computes a certified quote.

Keep color, spacing, typography and motion tokens centralized. Keep copy in one content module. Route layouts compose small domain components; do not build a generic page-builder framework. Behavior tests use accessible names and outcomes; screenshots capture current design without making every pixel immutable.

## Initial direction

Use a compact midnight Saturn hero with Swap and Provide liquidity actions immediately available. Use pale periwinkle transaction backgrounds, lavender accents, restrained typography, flat data rows, and whitespace. Keep orbital illustrations optional and clearly labeled educational; no mandatory 420svh pin, autoplay spectacle, or delay before financial actions. CSS/vector geometry is sufficient for the initial illustration. Add optional lazy Three.js/GSAP only if it improves explanation within the performance budget.

Retain the master’s colors, fonts and sizes as starting values, not a restriction on subsequent redesign. Preserve AA contrast, 44px targets, visible focus, mobile layout, reduced-motion behavior, and performance budgets.

## Journeys

| Route | Primary outcome |
| --- | --- |
| `/` | Understand wallet-held concentrated liquidity; start a swap or strategy |
| `/swap` | Select assets/amount, inspect quote, approve exact input, review and execute |
| `/liquidity` | Inspect the active wallet’s strategies and start publication |
| `/liquidity/new` | Assets → Concentration → Review → resumable Publish |
| `/liquidity/[strategyHash]` | Inspect live availability, fees, and owner lifecycle actions |
| `/pay` | Create or inspect immutable invoices |
| `/pay/[invoiceId]` | Review terms and pay directly or through an Orbital swap |
| `/proof` | Inspect real deployment, math, opcode, wallet and receipt evidence |

One primary action per stage. Keep asset/amount, minimum output, fee, gas, network, recipient and approval visible when relevant. Put raw geometry, hashes and detailed traces behind accessible disclosure controls. Never hide an unsafe condition to simplify the screen.

Every data view has disconnected, loading, empty, unavailable, stale, error and loaded states as applicable. Public browsing needs no login. Account/network changes invalidate unsigned plans; submitted transaction links survive. A backend outage never becomes a seeded quote.

## Redesign acceptance

Changing tokens, copy, layout or decorative motion must leave SDK and transaction-state tests unchanged. Verify keyboard operation, 320px through desktop widths, 200% zoom, long values, pending/rejected/reverted operations and reduced motion. Inspect screenshots at meaningful workflow states, not just the landing page.

## Current implementation map

- `apps/web/src/app/globals.css`: central visual tokens and basic controls. Page/component CSS Modules own local layout. System fonts are the current fallback; final font/performance selection remains open.
- `apps/web/src/content.ts`: shared product copy. Some feature copy remains colocated in presentation and can move here as the workflows are completed.
- `features/useSwap.ts`: explicit public quote observations with fresh deployment checks, exact SDK decoding/formatting, bounded cancellation, context invalidation and automatic expiry. `features/Swap.tsx:SwapView` receives typed state/callbacks and builds no calldata. Fees, minimum output and recipient remain visible; coverage and alternatives use the existing disclosure pattern.
- `features/useInvoice.ts`: public canonical invoice reads, coherent deployment refresh, exact SDK amount formatting, observation labels and receipt links. `features/Invoice.tsx:InvoiceView` receives typed state/callbacks and stays within the existing presentation template; it never selects a spender or prepares a payment. `features/api.ts:requestPayload` bounds headers/body reads to 30 seconds and forwards navigation cancellation.
- `packages/sdk/src/invoice-read.ts`: validates invoice wire data, deployment identity/token metadata, exact recipient splits and canonical observation coverage. An indexed unpaid status never establishes payment eligibility.
- `wallet/`: Privy/wagmi providers, explicit wallet selection and live account/chain checks. Public content remains visible while the Privy module loads.
- `packages/sdk/src/execution.ts`: provider-independent signature/gas/account-change/receipt recovery boundary; sends the selected gas and fee caps, retaining a submitted hash before waiting for its receipt. Its fixture tests do not prove Privy service behavior.
- `packages/sdk/src/payment-review.ts`: decoded immutable payment intents, exact approval/payment reconstruction, canonical invoice/funding checks, simulation/gas release conditions, Arc's shared USDC inventory and single-use reviews. Typed ports keep wallet-provider code out of the financial logic.
- `features/usePayment.ts` orchestrates explicit quotes/reviews/signatures; `features/Payment.tsx` displays typed formatted state and callbacks within the current invoice template. Context changes invalidate a review permanently; confirmation does not invent a paid invoice while its index observation is still unpaid.
- `wallet/paymentPort.ts` performs hash-pinned invoice/funding reads. `wallet/transactionPort.ts` now shares exact simulation without overrides, gas estimation, and canonical transaction/receipt verification between payments and standalone swaps. `features/paymentStorage.ts` stores only public submitted transaction data under wallet/chain/invoice keys. Recovery cannot call a signing method.

All documented routes exist. Public `/pay/[invoiceId]` reads display immutable terms, recipients and direct/swap payment receipts when the configured API supplies checked data. Connected users can request direct or swap-funded payment review after current state and simulation succeed. Exact approval and payment remain separate signatures; after an approval receipt the user requests a fresh quote. Both pending and reverted transaction hashes stay available, and receipt gas is shown separately from its earlier budget. `/swap` displays validated quote observations and expires stale amounts. An explicit fresh review checks current strategy/funding and simulation before a separate approval or swap signature. `features/useSwapExecution.ts` controls this flow and per-hash recovery; `features/SwapExecution.tsx` renders typed state and callbacks. SDK `swap-review.ts` owns release checks and `swap-receipt.ts` validates actual settlement amounts/crossings.

The [payment workflow evidence](../test/evidence/payment-flow.md) extends the original nineteen Chromium checks with payment review, signing rejection, changed accounts, expiry, revert, transaction/receipt mismatch, storage failure and reload recovery. The tests use synthetic HTTP/RPC and injected wallet fixtures. [Standalone swap evidence](../test/evidence/swap-flow.md) covers approval, review and receipt recovery. Swap defaults/settings, balances/Max, automatic refresh and replacements remain unfinished. Strategy publication and invoice creation/cancellation remain guarded previews/unavailable states. Full financial flows, resumed publication, 200% zoom, cross-browser, automated accessibility and performance campaigns are not yet complete. [Invoice UI evidence](../test/evidence/invoice-detail-ui.md), [swap observation evidence](../test/evidence/swap-observation-ui.md).
