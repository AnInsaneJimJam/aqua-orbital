# Frontend: minimal workflows, editable design

## Authority

The master owns financial behavior and security. This document owns editable presentation defaults. Its visual guidance supersedes the old master’s exact layout measurements and scroll timeline; changing presentation does not authorize changing fee, custody, slippage, approval, or settlement behavior.

## Architecture

Use Next.js App Router, React, CSS Modules, Radix primitives, and the shared bigint SDK. Separate feature controllers (queries/state machines/actions), wallet integration (Privy/wagmi), and presentational components (typed state and callbacks). Presentation never assembles calldata, chooses an allowance spender, or computes a certified quote.

Keep color, spacing, typography and motion tokens centralized. Keep copy in one content module. Route layouts compose small domain components; do not build a generic page-builder framework. Behavior tests use accessible names and outcomes; screenshots capture current design without making every pixel immutable.

## Current direction — September 9, 2026

The owner's latest instruction replaces the interim monochrome/neumorphic direction with an identity built around their **Orbital paper video and SVG logo**. The page background matches the video at `#00131B`; warm light text, chartreuse actions and fine diagram rules connect landing and product screens. Self-hosted Instrument Serif supplies the landing headline; Space Grotesk handles navigation, forms and transaction values. `globals.css` owns palette, radii, shadows and duration; `content.ts` owns the media motion defaults. Keep 14px critical financial values, AA contrast, visible focus and 44px controls.

The landing page leads with a short headline, two direct actions and the supplied 4:3 video in a figure with Paradigm credit. A three-link navigation rail exposes swaps, liquidity and payments. The supplied SVG is the shared header mark and favicon; do not substitute a generated Saturn. See [asset provenance](ASSETS.md) for originals, poster generation, checksums and font notices.

`components/OrbitalVisual.tsx` isolates media behavior from financial workflows. It uses a still poster before hydration and under reduced motion, explicit play/pause, muted inline playback, viewport/background pausing, and a still-image error fallback. It never loads an animation framework or treats the paper visualization as live financial state. Public content and links work without wallet setup.

Swap uses two asset wells with inline balance/Max controls; settings and raw routing information use disclosures. Payments pairs a focused creation form with invoice history. Optional splits and references expand on demand, while the signing review always shows recipients and amounts.

Strategy cards show available output and fees; exact principal and backing remain available in named disclosures. Stale/unavailable warnings stay visible. Empty incomplete-shipment sections disappear while their query continues to refresh. The short local-development banner remains explicit about test assets. No quote, spender, approval, signature or recovery controller is redesigned here.

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

- `apps/web/src/app/globals.css`: central visual tokens and basic controls. Page/component CSS Modules own local layout. Local fonts and source notices live in `src/fonts`; no Google font network request is required at runtime or build time.
- `apps/web/src/content.ts`: shared product copy. Some feature copy remains colocated in presentation and can move here as the workflows are completed.
- `features/useSwap.ts`: debounced and periodically refreshed public quote observations with fresh deployment checks, exact SDK decoding/formatting, bounded cancellation, context invalidation and automatic expiry. `features/Swap.tsx:SwapView` receives typed state/callbacks and builds no calldata. Fees, minimum output and recipient remain visible; coverage and alternatives use the existing disclosure pattern.
- `features/useInvoice.ts`: public canonical invoice reads, coherent deployment refresh, exact SDK amount formatting, observation labels and receipt links. `features/Invoice.tsx:InvoiceView` receives typed state/callbacks and stays within the existing presentation template; it never selects a spender or prepares a payment. `features/api.ts:requestPayload` bounds headers/body reads to 30 seconds and forwards navigation cancellation.
- `packages/sdk/src/invoice-read.ts`: validates invoice wire data, deployment identity/token metadata, exact recipient splits and canonical observation coverage. An indexed unpaid status never establishes payment eligibility.
- `wallet/`: Privy/wagmi providers, explicit wallet selection and live account/chain checks. Public content remains visible while the Privy module loads.
- `packages/sdk/src/execution.ts`: provider-independent signature/gas/account-change/receipt recovery boundary; sends the selected gas and fee caps, retaining a submitted hash before waiting for its receipt. Its fixture tests do not prove Privy service behavior.
- `packages/sdk/src/payment-review.ts`: decoded immutable payment intents, exact approval/payment reconstruction, canonical invoice/funding checks, simulation/gas release conditions, Arc's shared USDC inventory and single-use reviews. Typed ports keep wallet-provider code out of the financial logic.
- `features/usePayment.ts` orchestrates explicit quotes/reviews/signatures; `features/Payment.tsx` displays typed formatted state and callbacks within the current invoice template. Context changes invalidate a review permanently; confirmation does not invent a paid invoice while its index observation is still unpaid.
- `wallet/paymentPort.ts` performs hash-pinned invoice/funding reads. `wallet/transactionPort.ts` now shares exact simulation without overrides, gas estimation, and canonical transaction/receipt verification between payments and standalone swaps. `features/paymentStorage.ts` stores only public submitted transaction data under wallet/chain/invoice keys. Recovery cannot call a signing method.

All documented routes exist. Public `/pay/[invoiceId]` reads display immutable terms, recipients and direct/swap payment receipts when the configured API supplies checked data. Connected users can request direct or swap-funded payment review after current state and simulation succeed. Exact approval and payment remain separate signatures; after an approval receipt the user requests a fresh quote. Both pending and reverted transaction hashes stay available, and receipt gas is shown separately from its earlier budget. `/swap` displays validated quote observations and expires stale amounts. An explicit fresh review checks current strategy/funding and simulation before a separate approval or swap signature. `features/useSwapExecution.ts` controls this flow and per-hash recovery; `features/SwapExecution.tsx` renders typed state and callbacks. SDK `swap-review.ts` owns release checks and `swap-receipt.ts` validates actual settlement amounts/crossings.

The [payment workflow evidence](../test/evidence/payment-flow.md) extends the original nineteen Chromium checks with payment review, signing rejection, changed accounts, expiry, revert, transaction/receipt mismatch, storage failure and reload recovery. The tests use synthetic HTTP/RPC and injected wallet fixtures. [Standalone swap evidence](../test/evidence/swap-flow.md) covers approval, review and receipt recovery. Swap defaults, saved settings, canonical balances and gas-aware Max are now implemented. `useSwapSettings.ts`, `useSwapBalance.ts` and `wallet/balancePort.ts` isolate device preferences and public funding reads; SDK `swap-controls.ts` keeps reserve calculations and bounded candidate estimation outside presentation. [Control evidence](../test/evidence/swap-controls.md). Replacements and full route detail remain unfinished. Invoice creation and merchant cancellation now use `useInvoiceAdmin.ts`, typed `InvoiceAdminView`, SDK `invoice-admin.ts`, hash-pinned `wallet/invoiceAdminPort.ts` and per-hash public recovery storage. The shareable creation ID comes only from the checked event. Final recipient remainders, immutable terms and gas stay visible; changed or terminal live state blocks cancellation. [Administration evidence](../test/evidence/invoice-admin.md). Strategy publication remains a guarded preview. Full financial flows, resumed publication, 200% zoom, cross-browser, automated accessibility and performance campaigns are not yet complete. [Invoice UI evidence](../test/evidence/invoice-detail-ui.md), [swap observation evidence](../test/evidence/swap-observation-ui.md).

Registered liquidity listing/detail now use `useStrategies.ts`, `useStrategy.ts`, typed `StrategiesView` / `StrategyView`, and the SDK strategy read decoder. Each inventory observation has its own block and freshness label. Principal, received fees and output ceilings remain distinct; invalid refreshes remove prior financial data. Presentation keeps the current template and builds no calldata. [Read workflow scope](../test/evidence/strategy-read.md). Owner instruction now prioritizes integration and lightweight build/type/smoke verification; broader visual/browser/release campaigns are deferred.

Strategy owner actions use `useStrategyAdmin.ts`, typed `StrategyAdminView`, SDK `strategy-admin.ts`, direct hash-pinned `wallet/strategyAdminPort.ts` and public `strategyAdminStorage.ts`. Retirement and docking stay separate reviewed signatures; allowance resets explicitly disclose shared-strategy interruption. Actual local-chain browser execution remains pending. [Implementation checkpoint](../test/evidence/strategy-admin.md).


## Connected local workflows (2026-09-08)

The connected workflow predates the monochrome redesign. `useStrategyPublication` owns preset preparation, nonce reads and draft persistence; `useStrategyAdmin` owns each approval/ship/activate/retire/dock review. `Liquidity` and `StrategyAdminView` receive display data and callbacks. Tokens remain in the maker wallet throughout publication.

`/fund` provides demo funding through `useDemoFunding`. Invoice history uses `useInvoices`; unactivated Aqua allocations use a separate canonical, paginated shipment read. These views do not construct calldata. Registered strategy details expose current principal, cumulative fees and funding separately. A new configuration uses a new maker nonce; retired orders are terminal.

The local fixture wallet is restricted to a loopback development build on chain 31337. Privy and external-wallet providers use the same transaction ports. A slow wallet initialization exposes a retry after 15 seconds. In-place fee increases are followed only when the replacement matches the original sender, nonce, destination, calldata and value. An unavailable original transaction remains a recovery limitation; it cannot be labeled as the requested action merely from a different hash.

## Latest light checkpoint

The September 9 supplied-media redesign has a passing production build and focused Chromium/mobile/media/keyboard checks. The local swap quote and exact approval review were rechecked without a signature. Full browser, accessibility and performance release campaigns remain deferred. See [checkpoint and retained failures](../test/evidence/frontend-design.md).
