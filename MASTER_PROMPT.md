# Master build prompt — Orbital on Aqua and Arc

Version 2.3 · September 9, 2026 · Financial behavior is normative; visual defaults are editable.

Use this prompt in the repository containing the linked mathematical and test documents. Those files are part of the prompt's input, not optional background. Implementation status is recorded in PROGRESS.md and test/evidence/INDEX.md; this specification does not imply implementation or deployment completion.

## 1. Your assignment and definition of success

Build **Orbital**, a working stablecoin liquidity and payments application for the 1inch Aqua, Circle Arc, and Privy Best financial flow tracks described by the user. Deliver the Solidity contracts, modified SwapVM with meaningful custom opcodes, independent mathematical reference, extensive tests, TypeScript SDK, backend/indexer, complete responsive frontend, reproducible local demo, target-network deployment tooling, and judging evidence.

The product statement is:

> Put stablecoin liquidity into orbit. Keep custody of your tokens, choose your concentration, and settle swaps and payments in USDC on Arc.

Implement the decisions in this prompt. Do not ask the user to choose frameworks, database, routes, fee model, instruction bytes, colors, animation library, or product scope. Resolve routine implementation details within these contracts. An unresolved external fact, incompatible upstream dependency, failed mathematical assumption, or unavailable deployment credential must be reported accurately; a prompt cannot eliminate the need to reason about correctness or verify reality. Complete independent work while such a fact is unresolved.

**Current execution order (owner update, September 9):** finish the remaining application integrations with type/build checks and focused smoke checks, then run the broader acceptance campaigns. Do not count deferred checks as passed. The extensive milestone suites, mathematical correctness, settlement/security obligations and release gates below remain required for acceptance. Do not substitute a polished mock frontend for the protocol or implement a two-token constant-product AMM and call it Orbital.

Success means an LP uses their wallet to publish a three-token, multi-tick Aqua strategy without depositing assets; another wallet swaps any directed pair through the deployed custom SwapVM; the same system atomically settles a USDC invoice; and tests, receipts, opcode traces, and the UI demonstrate those facts. Landing-page animation is an explanation of this working system.

## 2. Read order, authority, and migration from the earlier specification

Read in this order:

1. This entire prompt: authoritative architecture, full-stack behavior, and delivery gates.
2. [Aqua/SwapVM source findings](docs/AQUA_RESEARCH.md) and [Arc findings](docs/ARC_RESEARCH.md): exact upstream boundaries, source pins, unresolved network verification.
3. [MATH](docs/MATH.md): retained Orbital geometry, root selection, reconstruction, and crossing corrections.
4. [NUMERICS](docs/NUMERICS.md): retained units, wide arithmetic, interval certification, and conservative principal rounding, with overrides below.
5. [TESTS](docs/TESTS.md): retained mathematical fixtures and adversarial methods, with Aqua-specific acceptance replacing pooled ownership tests below.
6. [Original SPEC](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ff7bd940a1e6b961523b34364163f4599a232e9/SPEC.md) and [original PLAN](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ff7bd940a1e6b961523b34364163f4599a232e9/docs/PLAN.md) only when resolving historical rationale. Their custodial deployment architecture is superseded.

This prompt wins over conflicting earlier documents for this build. Keep the earlier derivations; do not accidentally build both products.

The mechanism is the user's [Orbital paper](https://www.paradigm.xyz/writing/orbital). The additionally supplied [arXiv:2510.05428v1](https://arxiv.org/html/2510.05428v1) describes Orbswap's polar-coordinate approach and is comparative context, not permission to replace Orbital's spherical caps, torus consolidation, or certified Solidity arithmetic with a different invariant or floating-point Rust example.

| Earlier contract | Aqua implementation decision |
| --- | --- |
| One custodied `OrbitalPool` aggregating multiple LP owners | One maker owns a complete Aqua strategy containing several Orbital ticks; makers have independent states |
| Factory deploys/funds a pool | Deploy one Orbital SwapVM router; makers ship immutable orders to verified unchanged upstream Aqua and explicitly activate them |
| Shared radius shares and LP position NFTs/IDs | Strategy ownership is the maker wallet; no cross-maker share token or redemption claim |
| Permanently inaccessible funded anchor | Positive full-range tick in each active strategy; maker can deactivate the **entire** strategy at any time |
| Mint/increase/burn at arbitrary state | Approve → ship → activate; resize/reconfigure by deactivate/dock and publish a fresh order |
| Escrowed fees and global radius fee growth | Gross input reaches the maker wallet; net input updates principal; the fee is already maker-owned and separately counted |
| Exact pool-custody identity | App principal is bounded by Aqua's strategy accounting; actual transfers remain contingent on maker balance/allowance |
| Exclude callbacks, routers, payments | Retain controlled upstream settlement; add one dedicated invoice adapter; arbitrary hooks/callbacks remain excluded |
| Production 32 tokens / 64 ticks | App validates 2–8 tokens / 1–8 ticks; flagship demonstration is 3 tokens / 3 ticks; large-dimension mathematics stays in the reference suite |
| Unbounded common frontend token selection | Fixed deployment token allowlist and immutable token set per strategy |

Retain `MATH-1..11`, corrected price orientation, additive boundary radius, supporting-price checks, connected roots, and inward-then-outward crossings. In MATH, interpret the anchor as active-strategy full-range liquidity, not permanent locked capital. Retain `NUM-1`, `NUM-4..14` and the applicable numeric evidence obligations. Replace `NUM-2` share lifecycle, `NUM-3` pool-custody cap, and `NUM-15..17` pooled allocation/fee-growth semantics with the strategy rules here. Keep their integer range discipline and conservative transfer rules. Record pooled-only tests as explicitly superseded with this table's reason, rather than silently deleting failing tests.

## 3. Locked product scope

### 3.1 What ships

- One custom Orbital Aqua/SwapVM app on Arc **Testnet**, plus a fully reproducible local chain.
- Maker-owned bundles of nested spherical-cap ticks, exact-input swaps, per-maker state, and current inventory/availability views.
- Two deployed custom instructions: `OrbitalFeeIn` and `OrbitalSwap`.
- A narrow source modification enabling arbitrary token-pair selection within one n-token SwapVM order.
- A gas-aware USDC invoice payment flow with atomic recipient splits and excess refund.
- Pages `/`, `/swap`, `/liquidity`, `/liquidity/new`, `/liquidity/[strategyHash]`, `/pay`, `/pay/[invoiceId]`, and `/proof`.
- Public read/quote API, event indexer, shared SDK, real receipt-backed metrics, static mathematical illustrations labeled as illustrations.

Excluded: mainnet launch; pooled cross-maker LP shares; transfer of strategies; in-place radius changes; partial fills; exact-output swaps; cross-chain settlement; yield farming; lending; guaranteed APY; dynamic oracles; EURC/USYC at a one-dollar peg; arbitrary token import; automatic keeper signing; application-held user keys and server signing; CCTP/Gateway/StableFX/App Kit integrations; and claims of automatic 1inch Pathfinder discovery of this custom router.

### 3.2 Demonstration assets and parameters

Use genuine **Arc testnet USDC** as the first economic asset, with its official ERC-20 interface. Deploy two standard test-only ERC-20s named **Orbital Demo Dollar 6 (`oUSD6`)** and **Orbital Demo Dollar 18 (`oUSD18`)**, with 6 and 18 decimals respectively. Label them “Demo token — no redemption value” in selectors, LP review, landing illustrations, and judging evidence. Their faucet is available only on local/testnet deployments: each connected address can mint 1,000 whole units of each demo token once per 24 hours, enforced onchain. This is a test-resource limit, not Sybil protection or an economic guarantee. Never use real stablecoin brand names for these mock contracts.

Onchain arrays are sorted by address, independently of presentation order. The SDK maps the display order USDC/oUSD6/oUSD18 to those indices. Token symbols, decimals, addresses, and mock status come from the verified deployment manifest; arbitrary token metadata is not executable HTML.

Every strategy has a positive full-range tick. At initial equal-price state its upward-rounded raw funding must be at least one whole token per asset; its geometric principal may differ only by certified initialization rounding, at most one normalized atom per asset. Test this distinction so rounding cannot make the default one-unit full-range allocation unpublishable. The default LP wizard configures **10 units per asset**, 20 nominal units for the default two-token selection (30 when all three demo assets are selected), and a 500 ppm fee (0.05%). Maker may select per-asset allocation from 10 to 1,000,000 units subject to wallet inventory, allowance, numeric bounds, and testnet faucet availability. Other initial token proportions are excluded.

Three fixed concentration presets distribute **initial funded principal**, not radius, across ticks:

| Preset | Full-range share | Medium cap | Tight cap |
| --- | --- | --- | --- |
| Wide | 50% | 30% at single-depeg reference `p=.90` | 20% at `p=.99` |
| Balanced, default | 10% | 30% at `p=.95` | 60% at `p=.99` |
| Focused | 10% | 20% at `p=.99` | 70% at `p=.999` |

Convert each reference price using `b_depeg` in MATH, quantize to the smallest valid grid boundary at or above the real value, and display the actual realized cap/threshold. If quantization violates a bound, reject that configuration; never silently choose another preset. Compute radii from the allocated principal using `r_t = capitalPerAsset_t/(q0-m_t)`, with certified downward radius selection so the final upward-rounded Aqua allocation does not exceed the user's per-token maximum. Validate the full-range minimum **after** rounding. The LP may choose fee 100, 500, or 1,000 ppm; default 500. The contract accepts only those three fees in this app version.

“Reference depeg threshold” is a single-coin scenario interpretation. It is not a guaranteed price floor, stop loss, or insurance. All three ticks belong to the same maker, so no fee-allocation policy between independent LPs is needed.

## 4. Network, upstream, and deployment contract

### 4.1 Source and environment pins

Pin SwapVM to `1inch/swap-vm` commit `f09a41e689240adc645934f965c8061749397cd2`. Pin its official Aqua v1.0.0 dependency to commit `81c26e4619ce21556ab02b3284ee2685de21fb18`. Use Solidity `0.8.30`, optimizer 700 runs, via-IR enabled, and explicitly selected Cancun EVM target after verifying Arc transient-storage compatibility. Preserve the upstream dependency versions recorded in AQUA_RESEARCH and lock their exact resolved revisions. Changes to these pins require renewed ABI, opcode-collision, and upstream regression checks.

Store the minimal SwapVM fork in `packages/contracts/vendor/swap-vm-orbital/`, with an unmodified source baseline and a reproducible patch/diff report. Use the official Aqua source unchanged. The owner explicitly authorizes deploying the pinned upstream `AquaRouter` wrapper on Arc Testnet as a **project-deployed upstream AquaRouter**. Retain its source/build provenance and label its resulting address separately from the official canonical deployment. Do not substitute a mock registry or claim sponsor approval. Local tests may deploy the unmodified official Aqua source.

**Sponsor scope clarified by the owner, September 9:** the [1inch track](https://ethglobal.com/events/ethonline2026/prizes/1inch) explicitly permits modified SwapVM deployments, custom instructions, and local-fork token-transfer demonstrations. Orbital's custom curve/instruction architecture fits that scope. The track does not require its demonstration to run on Arc. Assess the 1inch demonstration separately from Arc deployment and Privy's authenticated financial flow; missing canonical Aqua on Arc must not block preparing the 1inch demonstration. Retain official Aqua provenance, actual execution evidence and meaningful Git history. A fresh Anvil deployment of upstream source is distinct from a fork containing an existing official deployment; label each accurately. The modified-SwapVM exception alone is not evidence that every independently deployed Aqua address has official status.

Preserve license headers, mark changes, and provide corresponding fork source and reproducible build instructions. Include the required source attribution, **“Powered by SwapVM — © Degensoft Ltd 2025”**, in the implementation README and the UI footer. Follow the pinned license text for modified portions; do not label the whole upstream fork MIT or imply sponsor certification. [Upstream license](https://github.com/1inch/swap-vm/blob/f09a41e689240adc645934f965c8061749397cd2/LICENSES/SwapVM-1.1.txt)

### 4.2 Network identity and address candidates

| Item | Selected value / status |
| --- | --- |
| Target network | Arc Testnet, chain ID `5042002` |
| Primary RPC | `https://rpc.testnet.arc.io` |
| Explorer | `https://testnet.arcscan.app` |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` |
| User-supplied official Aqua candidate | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` |
| User-supplied official router reference | `0x111111338c5091E8440b67B168bAe16a668AC0De` |
| Selected Aqua deployment mode | `self-deployed-upstream`: project-deployed unchanged pinned `AquaRouter`, address derived from the new plan and verified after deployment |
| Authorized Arc deployer / AquaRouter rescue owner | `0x5eBA55e1b43c8714E4432250Dada7A518780C871` |
| Actual Orbital custom router | Determined by deployment; **not** the published router address |

The recorded RPC observations did not establish code at the published canonical Aqua and stock SwapVM addresses on Arc. This does not prevent the authorized project deployment. Before enabling application transactions, the deployment verifier must capture chain ID, block/hash, Aqua source/build/runtime identity, creation receipt, constructor owner and ABI, system USDC identity and decimals, router `AQUA()` binding, deployed fork bytecode/build, and EVM compatibility in `deployments/5042002/verification.json`. `verify-network` subsequently checks the active record read-only. Source provenance and exact runtime/receipt checks establish the project deployment's identity; they do not confer official canonical status. The published stock router cannot acquire new opcodes through configuration; Orbital requires its own deployment.

**Owner-authorized deployment update, September 9:** proceed with unchanged upstream AquaRouter self-deployment on verified Arc Testnet. Missing canonical Aqua or sponsor acceptance must not block this functional integration. Use `prepare --self-deploy-aqua --plan deployments/5042002/plans/self-deployment.json` with the authorized deployer; retain the earlier blocked `plans/deployment.json` and canonical-address research as history. Prepare a new nonce-bound graph rather than modifying or executing the old plan. Keep application writes disabled until the new deployment's receipts, runtimes and bindings verify successfully. Sponsor qualification remains unverified and separate from functional deployment.

This update supersedes the earlier project requirement to obtain an official canonical Arc registry or maintainer exception before deployment. The 1inch track permits custom SwapVM and local-fork demonstrations; keep fresh Anvil, canonical-network fork and project-deployed Arc evidence accurately labeled. Source provenance, runtime verification, sponsor assessment and mathematical release acceptance are separate checks.

The current user-signed deployment workflow is documented in [ARC_DEPLOYMENT](docs/ARC_DEPLOYMENT.md). `deploy:arc` prepares authenticated, nonce-bound transactions; the loopback browser utility requests each signature from the authorized wallet. The self-deployment graph contains twelve transactions: AquaRouter, six linked libraries, two demo tokens, the custom Orbital router, payments adapter, and custom-router ownership renunciation. Follow the generated dependency/nonce order. Only successful receipt/runtime/binding verification publishes an active manifest. The separate [Arc/Privy profile](docs/ARC_DEMO.md) permits public browsing and login while deployment is unavailable. No live deployment receipts were present when this specification update was written; tooling and authorization do not establish successful deployment or sponsor qualification.

For Arc balances, use the ERC-20 representation for token amounts/approvals and native units for gas estimation. Both represent the same USDC inventory. `msg.value` is always zero on Orbital swaps/payments. Set the unused WETH immutable to zero and reject native/wrapping traits before execution; never deploy “wrapped USDC” merely to satisfy a WETH constructor argument. Test that the pinned base accepts this unused value.

The fork retains no operational administrator. Deploy with the deployer as the upstream rescue-only owner, then renounce ownership before activation/client enablement and verify `owner()==0`; `activateStrategy` enforces this onchain. Normal transactions end with zero router token delta. Accidental external router donations remain inert. Do not add upgradeability, arbitrary token rescue, admin curve edits, or maker-key management.

This renunciation requirement applies to **OrbitalSwapVMRouter**, not the upstream **AquaRouter** registry wrapper. Deploy AquaRouter unchanged with the authorized deployer as its constructor owner and preserve its existing rescue helper for funds accidentally sent to that wrapper. Verify and disclose that owner. This does not introduce pooled custody, a new administrative curve capability, or application-held keys; maker funds remain in maker wallets under the existing Aqua lifecycle.

## 5. System architecture and exact ownership

```text
Maker wallet                  Taker / payer wallet
  | approve Aqua                 | approve router or payment adapter
  | ship order                   |
  v                              v
Upstream Aqua <---------- OrbitalSwapVMRouter <----- OrbitalPayments
  | allocation accounting       | custom instructions      | invoice + splits
  | maker-to-recipient pull     | maker/order state        | atomic USDC receipt
  | router-to-maker push        | certified Orbital math   |
  +-----------------------------+--------------------------+
                         chain events / static quotes
                                      |
                         Indexer -> PostgreSQL -> API
                                      |
                            shared SDK -> web UI
```

The contracts are the truth for ownership, execution, and payment status. The backend discovers strategies, indexes events, and requests certified onchain quotes. It does not price trades using JavaScript floats, sign user transactions, custody funds, choose an arbitrary callback, or mark invoices paid without a receipt.

### 5.1 Monorepo and stack

Use a pnpm workspace without a separate monorepo task framework:

| Path | Fixed responsibility / stack |
| --- | --- |
| `apps/web` | Next.js 16 App Router, React 19, TypeScript strict mode, CSS Modules + design tokens |
| `apps/api` | Fastify 5 REST/SSE server, Zod 4 schemas, viem 2 RPC client |
| `apps/indexer` | Node 22 worker, viem logs, PostgreSQL transactions and replay |
| `packages/contracts` | Foundry, official Aqua, minimal SwapVM fork, Orbital math/opcodes/payments |
| `packages/sdk` | Pure TypeScript bigint amount handling, canonical order/config/instruction encoding, transaction plans, generated ABIs |
| `packages/shared` | Zod request/response schemas, errors, manifest types, versioned configuration |
| `packages/db` | Drizzle migrations/schema and deterministic materialization queries, PostgreSQL 16 |
| `packages/reference` | Offline Python high-precision explicit-tick oracle and fixture generator |
| `deployments` | Chain-specific addresses, verified source identity, constructor args, deployment receipts |
| `test/evidence` | Requirement matrix, command outputs, fixture provenance, gas and demo artifacts |

Use Node 22 LTS and pnpm 10. Resolve patched compatible exact package versions once in the scaffold milestone, record them in the lockfile/toolchain manifest, then use frozen installs. The version-family selection above is fixed; selecting a security-patched compatible patch is a mechanical verification step. No ethers/viem duplication, Redux, Redis, GraphQL, application account database/service, or third-party indexing service. Privy authentication and user-controlled embedded wallets are explicitly allowed; application-held keys and backend signing remain excluded.

Frontend wallet state uses wagmi and TanStack Query; forms use React Hook Form and shared Zod schemas; accessible primitives use Radix for dialogs, popovers, tabs, and tooltips. Use Lucide for functional icons. Use CSS transitions for ordinary UI and the owner-supplied Orbital video for the landing illustration. Keep a poster, keyboard-accessible playback control and reduced-motion behavior. No additional animation runtime is needed; do not add smooth-scroll interception. See docs/FRONTEND.md for editable presentation guidance.

### 5.2 Contract modules

| Module | Owned behavior |
| --- | --- |
| `OrbitalSwapVMRouter.sol` | Narrow upstream extension, exact program/traits validation, maker activation, views, global execution guard, dispatcher |
| `instructions/OrbitalFeeIn.sol` | Custom once-per-swap ppm fee wrapper; gross/net separation and fee counter |
| `instructions/OrbitalSwap.sol` | Terminal custom curve instruction; loads principal, traverses ticks, commits only in execution mode |
| `libraries/OrbitalStorage.sol` | Dedicated namespace keyed by maker/order hash; config, radius bundle, principal, aggregates, earned fees, state version |
| `libraries/{TickGeometry,OrbitalMath,TickBook,SwapEngine,WideMath}.sol` | Mathematical/numerical modules retained from the original design |
| `libraries/OrbitalOrderCodec.sol` | Canonical config/order/program/taker-argument validation, shared encoding fixtures |
| `OrbitalPayments.sol` | Invoice creation/cancellation, atomic swap-and-pay/direct-USDC payment, splits, replay protection |
| `src/OrbitalDemoDollar.sol`, `test/DemoDollar.t.sol` | Explicit local/Arc-testnet standard demo tokens, immutable 6/18 precision and bounded faucet behavior |

Do not deploy a separate LP vault, old OrbitalPool, fee escrow, share token, or per-tick custody contract. Per-tick baskets are mathematical state inside a maker-owned strategy.

### 5.3 Privy wallet integration

Privy powers existing Orbital financial actions and targets Best financial flow. Use its React SDK and wagmi integration for existing-wallet connection and email sign-in with a user-controlled embedded EVM wallet. Privy manages connectors; wagmi/viem executes canonical SDK plans. Isolate provider-specific code in the frontend wallet module; share typed active address, chain, wallet kind, readiness and transaction actions with feature controllers.

Keep browsing public. Keep explicit review/signature prompts, exact approvals, account/chain invalidation, gas reserve and receipt continuation. Never store user keys, email/session data in Orbital's database, or sign from the backend. No delegated/automatic signing, organization policies, card, paymaster, or smart-account integration is added.

Configure NEXT_PUBLIC_PRIVY_APP_ID and actual allowed origins. Without Privy configuration, the explicit local external-wallet profile remains useful but Privy evidence is unavailable. Do not silently substitute a mocked session. The qualification demo must show an actual embedded wallet executing the flagship Orbital swap and swap-funded USDC invoice, with public wallet address, receipt and source evidence. See docs/PRIVY_RESEARCH.md.

## 6. Strategy data, lifecycle, and reserve accounting

### 6.1 Immutable configuration and hash binding

`OrbitalConfigV1` fields, in this order, are: `schemaVersion:uint8` (=1), `chainId:uint256`, `router:address`, `maker:address`, `makerNonce:uint64`, `tokens:address[]`, `decimals:uint8[]`, `tickKeys:uint64[]`, `radiiInternal:uint192[]`, `feePpm:uint24`, `initialAmountsRaw:uint256[]`. Arrays must match their specified lengths. Tokens are strictly ascending; ordinary tick keys ascend followed by the unique full-range sentinel `type(uint64).max`. Every tick radius is at least `10^12 U`; every radius and their sum remain strictly below `2^160`, despite the wider ABI field. The registered allowlist fixes token decimals; confirm those decimals during registration.

`configHash = keccak256(abi.encode(config))`. The config includes its chain, router, maker and fresh nonce; it does **not** include `orderHash`, which would create a circular hash dependency. Build the pinned upstream `Order{maker,traits,data}` with `MakerTraitsLib.build`: two legacy prefix tokens are exactly `tokens[0]` and `tokens[1]`; no hooks; no custom maker receiver; Aqua mode true; zero-input and unwrap flags false. Its program is the two custom instructions specified below, each committing the same `configHash`.

`orderHash = keccak256(abi.encode(order))`. Ship **exactly `abi.encode(order)`** to Aqua with app equal to the custom router. Do not ship only `order.data`, the program, or the config. `hash`, TS SDK encoding, Aqua's emitted strategy hash, and router storage key must match byte-for-byte.

The router stores the immutable config on successful activation. It reconstructs/revalidates the canonical order during activation from the submitted config and order; during quote/swap it checks the supplied order against the activated order hash and stored config. Every entry validates the chain/router domain. A caller-provided config never replaces activated state.

### 6.2 Maker lifecycle

Use the resumable sequence **prepare locally → approve Aqua → ship directly to Aqua → activate in the router**. The router's `activateStrategy(config, order)` requires `msg.sender == order.maker == config.maker`, the current unconsumed maker nonce, canonical config/order, live Aqua entries for every immutable token, each Aqua raw allocation at least the certified starting principal, and wallet balances/allowances sufficient for the initial advertised principal. Registration moves no ERC-20s. It initializes the equal-point geometric state, stores initial surplus, advances nonce, and emits `StrategyActivated` with the full config/order hash reference.

A strategy is not quoteable before activation. No lazy first-swap initialization. Permissionless positive Aqua pushes between ship and activation are surplus and must not grief activation or alter the intended price. A failed activation leaves the order shipped but inactive; the UI offers resume or dock, not another identical ship transaction. Do not fake atomic EOA batching by calling Aqua through a helper that changes the maker to the helper.

`retireStrategy(orderHash)` is maker-authorized, marks the app state terminal, and moves no funds. User deactivation is retire then **maker-called** `Aqua.dock(customRouter, orderHash, exactSortedTokens)`. If docking happens first through another interface, all quotes already fail the Aqua live-entry checks; retirement can follow for cleanup. A retired order cannot be reactivated, even if Aqua allocation remains. A docked hash cannot be reused. Changes use a new nonce/order; no in-place principal reset, fee reset, or radius replacement.

LP approval default is bounded: for each token, approve Aqua up to **four times that strategy's initial raw allocation**, displayed in review. Existing sufficient allowance is reused; an optional explicit “Unlimited approval” control is allowed only when selected by the wallet owner, off by default. For tokens needing allowance reset, submit approve-zero then approve-cap as separate observable steps. Increasing approval is not increasing curve principal.

### 6.3 Principal, fees, and Aqua allocation

Keep the original normalized internal `X`, symmetric virtual offset `V`, `A=sum X`, wide `B=sum X²`, `R,K,S`, fixed tick radii, and state version separately for each maker/order. For token `i`, `P_i = X_i-V` is geometric principal in internal units. Retain the original exact arithmetic and interval rules. Tick classification can change; radius and virtual contributions cannot change during an order's life.

For every active token, define `Q_i = Aqua.rawBalances(...)` in raw units and `E_i = cumulativeEarnedFeeRaw_i`. Enforce

`Q_i * c_i * U >= P_i + E_i * c_i * U`.

The nonnegative difference is allocation surplus, not liquidity. Validate all immutable token entries have the expected live token count. With at most eight tokens, this is an explicit bounded `O(n)` registry check; invariant arithmetic remains constant-work in `n`. Do not repeat the old whole-swap constant-gas claim.

Perform the allocation inequality and surplus calculation with checked 512-bit arithmetic: Aqua's uint248 allocation multiplied by the normalization scale need not fit uint256. Do not carry the old pooled-custody cap over as a permissionless-donation rejection rule. Keep curve lengths within NUMERICS bounds; validate actual trade conversions against those bounds before applying them. Accumulate `E_i` with checked arithmetic; its required backing in `Q_i` also bounds it. Full wallet balances and allowances are raw availability observations, not geometric lengths to be cast into smaller types.

Gross input `g` produces fee `e=ceil(g*feePpm/1_000_000)` and net input `g-e`. Increase `P_in` by normalized **net** input, decrease `P_out` by actual normalized raw output, increment `E_in` by `e`, and let upstream settlement credit Aqua with gross input and debit output. Cumulative fees are analytics, not a withdrawal entitlement or claim against a contract. Makers already own them in their wallets and may spend them. There is no Collect Fees button.

An unsolicited direct `Aqua.push` increases surplus only; a direct wallet transfer changes physical availability only. Neither can reset prices, add radius, or mint a claim. Other strategies may share/spend the maker's wallet balance. A quote is not a reservation: a fill succeeds only if the requested output can actually transfer under the current wallet balance and Aqua allowance. Recheck required output availability before settlement; later races revert atomically. Do not require that earned fees remain separately present in the wallet.

Do not sum all makers' wallet balances and report that as guaranteed pooled TVL. Display “Advertised allocation” separately from “Available to fill,” with coverage warnings for shared or reduced inventory.

### 6.4 Shared read and event contract

Expose these semantic views on the router; freeze the generated Solidity ABI and matching SDK types before backend or frontend implementation:

- `nextMakerNonce(maker)` returns the next uint64 nonce; overflow prevents new activation, never wraps.
- `getStrategyConfig(orderHash)` returns the immutable `OrbitalConfigV1`; unknown hashes revert with a typed not-found error.
- `getStrategyState(orderHash)` returns maker, config hash, app status (Active/Retired), uint64 state version, ordered `X` and `P` arrays, `V`, `A`, wide `B`, `R`, exact `K` numerator, `S` lower/upper bounds, interior-tick bitmask, numerical slack certificate, and ordered cumulative raw fee counters. Decode wide integers as `(hi:uint256,lo:uint256)` pairs, never as a truncated uint256. Aqua-docked and limited-funding status are derived separately, not silently written by a view.
- `getStrategyAvailability(orderHash)` returns one observation per token: Aqua allocation/live count, raw wallet balance, raw Aqua allowance, backing-valid flag, wide allocation surplus/deficit and funding ceiling. Return surplus zero with an explicit deficit when backing is insufficient; never hide the deficiency. Funding ceiling is `min(floor(P_i/(c_i U)), Q_i, walletBalance_i, aquaAllowance_i)` in raw units for a live, adequately backed strategy, otherwise zero; it is **not** a guarantee that the curve can pay that amount for a proposed input. Only a certified quote plus successful settlement establishes that. Return deficient backing/live-entry status explicitly so a docked or unhealthy strategy can still be inspected.

All coherent-state views and quotes obey the settlement read guard. Immutable metadata/nonce views may remain readable because they expose no half-committed reserves. `StrategyActivated` identifies indexed maker/orderHash/configHash; full configuration is available from activation calldata and the config getter. `StrategyRetired` identifies maker/orderHash/version. Emit one canonical `OrbitalSwapExecuted` after successful settlement with maker, order hash, actual taker/recipient, pair indices, gross/net/fee/output raw amounts, resulting version, and ordered crossed tick keys/directions. These events are the indexer's app-level truth; do not infer trades from allocation events.

## 7. SwapVM fork and custom opcodes

### 7.1 Required source changes

At the pinned upstream, `quote(order, amount, takerTraitsAndData)` and `swap(order, amount, takerTraitsAndData)` infer a fixed pair from maker traits. **Do not use the older five-argument ABI from a different deployed release.** Both entry points must call one newly extracted virtual token-resolution helper. Its stock implementation preserves pinned upstream pair behavior; the Orbital override resolves two validated indices from taker instruction arguments against the registered immutable token set. The first-two-token prefix remains a canonical upstream encoding field, not the only tradable pair.

This is an intentional fork addition, not a method upstream already exposes. Inherit the patched abstract SwapVM and supply Orbital dispatch; the concrete upstream Aqua router's dispatch override is not virtual. Preserve the base's Aqua hashing, trait threshold/deadline validation, pull/push settlement, and rollback behavior. Add narrow validation/execution hooks to enforce Orbital's canonical modes, global cross-order reentrancy guard, token deltas, and post-settlement assertions.

Retain the upstream per-order lock and additionally block **all** Orbital swaps, activation/retirement, and coherent-state queries while a swap settlement is in progress. Quote may read the guard but must not write it. No external callback can observe a half-committed strategy or reenter another order. Exclude arbitrary hooks/callbacks and stock protocol-fee paths for registered Orbital orders.

### 7.2 Canonical bytes and dispatch

The VM instruction format is one opcode byte, one argument-length byte, then argument bytes. Freeze this exact program:

| Instruction | Opcode | Arguments | Responsibility |
| --- | --- | --- | --- |
| `OrbitalFeeIn` | `0x72` | 32-byte `configHash` | Charge the maker's ppm fee once, call the rest of the VM with net input, restore gross input |
| `OrbitalSwap` | `0x52` | Same 32-byte `configHash` | Execute the certified multi-tick exact-input Orbital transition |

Program bytes are `0x72 || 0x20 || configHash || 0x52 || 0x20 || configHash`, exactly **68 bytes**. Both slots are unused at the pinned opcode table; record this and test for collisions. There is no onchain opcode-registration call. Both instructions are compiled into the custom router's dispatcher. Reject all alternate/repeated/reordered/trailing programs for this app, including an extra stock fee, balance, jump, extension, or protocol-fee instruction.

Taker `instructionsArgs` is exactly four bytes: `[schemaVersion=1, tokenInIndex:uint8, tokenOutIndex:uint8, maxCrossings:uint8]`. Validate distinct in-range indices and `maxCrossings<=16`. The resolver reads these bytes without consuming them; the terminal opcode reads/consumes exactly the same validated four bytes. The fee wrapper consumes none. Freeze unused upstream `isAToB=true`; a false value is a noncanonical encoding and reverts. Amount and recipient are encoded through the upstream call/traits, not appended to these bytes.

### 7.3 Fee wrapper and terminal curve behavior

`OrbitalFeeIn` validates its hash/position, exact-input mode, and canonical program. Read the immutable fee from stored config. Save gross input, compute its ceiling raw fee with wide arithmetic, reject zero net input, replace `ctx.swap.amountIn` with net input, and execute the remainder using `ctx.runLoop()`. After return require the curve consumed exactly that net input, restore the exact original gross input, and update cumulative fee counter only when `isStaticContext==false`. This is deliberately separate from stock `FeeFlatIn`, whose pinned denominator differs. No partial-fill fee recomputation.

`OrbitalSwap` requires terminal PC equal to program length, matching config hash, live activated state and validated pair. It ignores upstream Aqua raw balances as a pricing source and loads app principal instead. Execute the original certified segment/crossing solver with net input. Set `ctx.swap.amountOut` to the conservative actual raw output, leave net `amountIn` unchanged for the wrapper, and commit principal/aggregate/partition/state-version changes only when `isStaticContext==false`. Fee accounting is the wrapper's job; do not charge again. Registered maker and order isolate storage.

Instruction state updates occur before the base performs transfers. This is safe only because any later threshold, deadline, balance, token-transfer or delta failure reverts the **entire** EVM transaction. Test that rollback, including instruction events and fee counters. `quote` through `ISwapVM`/staticcall executes the same math but performs no persistent/transient writes, logs, activation, or nonce change.

### 7.4 Canonical settlement traits and guards

Use exact-input; no partial fill; first transfer from taker; transferFrom-and-Aqua-push enabled; no wrapping/native value; no maker/taker hooks or callback payloads; no signature in Aqua mode; nonzero deadline; and a 32-byte minimum-output threshold with non-strict comparison. Use the pinned upstream builder, whose header is 22 bytes. Do not hard-code an imagined 32-byte traits header.

Taker approves **the custom router** for a normal swap. Router pulls gross input, approves Aqua, and pushes it to the maker; Aqua pulls output from maker to the explicit recipient. Maker approves **Aqua**. Enforce `msg.value==0`. Reject maker==taker, output recipient==maker, and recipients equal to zero/Aqua/router; these avoid degenerate self-settlement and ambiguous delta tests. Invoice adapter recipient is permitted. Sender/recipient identities used by settlement must match those used by quote validation.

Measure router, maker, and recipient transfer deltas for the touched tokens in the source fork's settlement hooks. Reject fee-on-transfer or nonconforming transfer behavior. Router's net token change is zero, excluding unrelated prior donations. Clear transient router-to-Aqua approvals after settlement where the token does not consume them exactly. No maker-token sweep is possible through arbitrary opcode execution because only the canonical program is admitted.

Global work bounds for this app: eight ticks, 16 transitions, and the inherited 160 bisection-step bound per solve. A user can tighten transitions to 0–16. Find earliest valid events and both quadratic roots as specified in MATH; final output is floored only once. All six directed pairs of the three-token demo must share the same Aqua order hash and mutable geometric state.

## 8. Arc-native invoice and treasury workflow

Deploy `OrbitalPayments` bound immutably to official testnet USDC, the verified custom router, and the deployment token allowlist. It holds funds only within a payment transaction and has no administrative withdrawal or arbitrary-call facility.

`createInvoice(amountDueRaw:uint256, expiresAt:uint40, recipients:address[], bps:uint16[], memoHash:bytes32)` is called by the merchant. Require positive USDC amount, expiry from 5 minutes to 30 days in the future, 1–3 unique nonzero recipients excluding the adapter, positive shares summing to 10,000, and supported raw bounds. Invoice ID is `keccak256(abi.encode(chainId, adapter, merchant, merchantNonce))`; increment nonce. Store immutable payment terms and status Unpaid. Persist only a memo hash, not customer names, emails, or invoice documents.

Merchant can call `cancelInvoice(invoiceId)` on an unpaid invoice. Expiry is derived from block timestamp, not a keeper write. Paid/cancelled invoices are terminal. Anyone may pay an unpaid unexpired invoice; no backend signature can mark it paid. `nextMerchantNonce(merchant)` and `getInvoice(invoiceId)` expose the nonce and immutable terms/status/payment record; unknown invoice IDs revert. Emit `InvoiceCreated`, `InvoiceCancelled`, and `InvoicePaid` with indexed invoice ID and merchant; the paid event additionally identifies payer, input token/amount, USDC received, refund and route hash (zero for direct USDC). Getters expose recipient arrays and split bps without requiring event reconstruction.

`payWithSwap(invoiceId, order, tokenInIndex:uint8, amountInRaw, minSwapOutRaw, deadline, maxCrossings)` uses the activated strategy's immutable token list. Resolve input from the explicit validated index and output from the unique USDC address in that list; reject absent USDC, invalid indices, or USDC input on this swap path. Never infer input from the legacy order prefix. Payer approves the **payment adapter**, not the router for this path. Adapter validates invoice/router/order/recipient constraints, pulls exact input from payer, approves the router for that amount, and builds canonical taker traits with recipient equal to itself. Its onchain threshold is `max(invoice.amountDueRaw, minSwapOutRaw)`. The router executes the Orbital swap. After receiving USDC, adapter splits **exactly the invoice amount**, refunds only this payment's excess USDC to payer, clears router allowance, and records Paid plus payer, input/output amounts, route order hash, and transaction event.

Snapshot adapter input-token and USDC balances before pulling input. Received USDC is the verified increase caused by this swap, not the adapter's entire balance; refund is that increase minus amount due. Unsolicited pre-existing donations are inert and cannot be spent or refunded by an invoice. Require exact input pull/router consumption, exact split/refund deltas, and zero final adapter token delta relative to those snapshots. Apply the same donation isolation to direct-USDC payments. Reject payer equal to the selected strategy maker on the swap-payment path, since the intermediate adapter otherwise bypasses the router's self-settlement restriction. No privileged sweep is added for accidental donations.

For recipients except the last, pay `floor(amountDueRaw*bps/10000)`; the last receives the exact remainder. If any split/refund fails, the swap, maker principal, fees, invoice status, and every transfer all revert. Use a single adapter reentrancy guard and an in-progress status before external interactions. Callback tests must cover replay, merchant cancellation, another invoice, and recursive swap settlement.

`payWithUSDC(invoiceId)` directly pulls exactly the due amount, performs the same splits, and marks paid; it charges no Orbital swap fee. UI chooses this path when USDC is the selected input. No native-USDC `msg.value` shortcut. Duplicate pays, zero amounts, a wrong invoice, expired/cancelled invoices, and backend-altered recipients fail onchain.

The backend finds a sufficient exact-input amount for a USDC invoice by bounded onchain **exact-input** quotes: maximum 16 bracket expansions and 24 bigint bisections within payer balance/max input. Each router quote uses `from=paymentAdapter`, recipient=paymentAdapter and the exact token indices/traits that the adapter will use; payer funding and self-settlement checks are additional adapter-path validation. This is quote preparation, not a new exact-output swap method. Return the full input, output, fee, refund estimate, and caller-controlled maximum. If no sufficient route is found, show an explicit unavailable state. The payer reviews before signing.

Demo invoice: 5 USDC, 90% merchant and 10% treasury, with a public non-sensitive memo hash. Demonstrate payment from `oUSD18`, recipient transfers in genuine testnet USDC, the retained maker fee, payer refund if any, and replay rejection. This is the concrete programmable-money use case for the Arc track.

## 9. SDK, API, backend, and indexer

### 9.1 SDK as the single encoding source

`packages/sdk` owns `buildConfig`, `buildOrder`, `hashConfig`, `hashOrder`, `encodeTakerArgs`, `buildSwapTx`, `buildMakerPlan`, `buildRetireAndDockPlan`, `buildInvoiceTx`, `buildPaymentTx`, amount formatting/parsing, and error decoding. Every financial value uses bigint or decimal-string inputs; floating point is allowed only in illustrative rendering.

Generate ABI artifacts from the pinned build. Share Zod DTOs between client/API; verify byte-for-byte parity against Solidity builders with golden fixtures. Browser independently reconstructs and validates every transaction target, chain, spender, amount, recipient and decoded calldata before requesting the wallet signature. Do not trust server-supplied arbitrary calldata, RPC URLs, token lists, or transaction targets.

Maker plan is a sequence of explicit wallet actions with labels, expected state checks, and receipt continuation. It stores unsigned config/order in localStorage under chain+wallet+nonce and resumes by querying chain state. No private key or signature is stored. Account/chain changes invalidate pending unsigned actions and quote state.

### 9.2 HTTP and SSE contract

All endpoints are under `/api/v1`; application amount fields are base-10 strings, addresses canonical hex, and chain ID an integer. Errors have `{code,message,retryable,field,requestId}` with optional safe diagnostic detail. Never expose secrets, connection strings, stack traces, or uncontrolled HTML.

| Endpoint | Input / output and behavior |
| --- | --- |
| `GET /health` | Process health and schema version; no credentials |
| `GET /ready` | Database, RPC chain identity, deployment verification and indexer freshness; fails closed for writes |
| `GET /manifest` | Verified network/contracts/tokens/source commits/opcode bytes/feature flags; unknown deployments are explicitly null |
| `GET /strategies` | Token pair, maker, status, cursor; max 50 records, default 20; verified activated strategies only |
| `GET /strategies/:hash` | Immutable config, principal, available inventory, fees, ticks, version, last block/hash and eligibility |
| `GET /makers/:address/strategies` | Paginated registered wallet strategies; combine with `/makers/:address/shipments` for incomplete/pre-activation docked receipts |
| `POST /quotes/swap` | Wallet, token addresses, raw input, slippage bps, recipient, max crossings; returns best whole-size route and up to 3 alternatives |
| `POST /quotes/payment` | Invoice ID, payer, selected input, maximum raw input; returns sufficient-input route, amount due/splits/refund and canonical unsigned plan |
| `GET /invoices/:id` | Onchain terms/status/payment receipt plus indexed display fields |
| `GET /makers/:address/invoices` | Merchant's paginated invoices; no customer identity |
| `GET /metrics` | Receipt-derived swaps/nominal volume/fees, active strategy count, observed date range and indexer freshness |
| `GET /events` | SSE carrying event type, chain/block/hash, entity ID and version; clients invalidate queries rather than trusting streamed balances |
| `GET /proof` | Generated test/build/deployment evidence manifest; statuses `verified`, `failed`, `not-run`, `unavailable` |

Write operations are signed in the browser and sent by the wallet, not accepted as backend “mark paid/register LP” mutations. Indexer discovers activation/ship/dock/payment receipts from chain. The UI combines registered strategy pagination with the separate canonical shipment endpoint (D33). A shipped-but-inactive order exposes maker/hash/program commitment, not necessarily its full config: retain an incomplete record and combine it with the owner's local unsigned draft for resumption. Do not invent tick parameters from an unknown config hash. Optional transaction-hash submission may only accelerate read-only receipt lookup and must never create authoritative state.

Quote preparation enumerates at most 32 eligible strategies for the pair from a bounded 200-record recent-activity candidate scan. Order candidates deterministically by recent successful activity, fee ascending, then hash. Request static onchain quotes using JSON-RPC batches of independent `eth_call` with the intended `from` caller; do not change caller context by quoting everything through a multicall sender. Pin quote/state/availability reads for one response to the same block hash, verify it remains canonical, and discard mixed-block or orphaned results. Require full-size fill and live output availability, discard failures with diagnostic reasons, then choose maximum raw output, fee ascending and hash ascending as tie-breakers. Do not split across makers or claim globally optimal routing. Response states how many strategies were considered.

Cache quotes in memory for at most 5 seconds by chain/block hash/order version/pair/amount/caller/recipient/limits; response expires after 20 seconds. Browser re-quotes after approval and immediately before building a swap. Onchain threshold/deadline remain the execution protection; a cache is not a reservation. Per RPC request timeout 8 seconds, at most 8 concurrent requests, two retries only for read transport errors with 250/750 ms delay. Cancellation aborts superseded quote requests.

The ten-second index age bound and twenty-second API quote lifetime govern admission of an observation, not the human review timer. Admit a validated fresh draft, independently check live state/funding/canonicality and simulate exact calldata, then issue an immutable review for up to sixty seconds from completed preflight, capped ten seconds before its transaction/invoice deadline. On submit repeat live checks and simulation for the same bytes, minimum, recipient and spend; reject state, account, allowance-stage or gas-budget changes and consume the review once. Recheck live block age (under twenty seconds), canonicality and the review/deadline before handing off to the wallet. Never refresh reviewed amounts silently or alter API timestamps to make an old response look fresh. Swap-funded payment calldata uses a locally chosen three-minute transaction deadline capped by invoice expiry, after independently validating the original API plan. The wallet prompt retains reviewed details; eventual inclusion is governed by the onchain deadline. See D42.

Rate-limit quotes to 30/minute/IP with burst 5 and reads to 120/minute/IP; body limit 16 KiB; enumerated allowlisted chain/token/order lengths; same-origin CORS by default. Never fetch an arbitrary user-supplied RPC URL, metadata URL, or callback target. The read server has **no signing key**.

### 9.3 Database and replay

Use PostgreSQL 16 and Drizzle migrations. Tables:

- `deployments`: chain/address/role/source hash/deployment block/code identity/verification status.
- `indexed_blocks`: chain, height, hash, parent hash, materialization status.
- `chain_events`: chain, block hash, transaction hash, log index, emitter, topic, decoded versioned payload; unique chain+blockHash+txHash+logIndex.
- `strategies`: chain+router+orderHash key, maker/config/nonce/token list, immutable initial amounts/ticks, lifecycle, latest state version/block.
- `strategy_tokens`: exact raw/internal principal, Aqua allocation, cumulative fees and last observed availability per token; no SQL floating point.
- `swaps`: canonical custom-router successful fill, maker/taker/pair/gross/net/fee/output/crossings/receipt identity.
- `invoices`, `invoice_recipients`, `invoice_payments`: onchain identities/terms/status/splits and verified successful payment event.
- `indexer_cursor`: chain+deployment cursor and canonical block hash.

Use PostgreSQL `numeric(78,0)` for bounded uint256 values; wide squared aggregates are validated decimal text/JSON strings. No double-precision money. Materialize an entire block and advance cursor atomically. Restart is idempotent. Fetch from recorded deployment blocks. The current production worker processes at most 64 confirmed blocks per pass, with at most eight concurrent header reads and four activation getters. A bounded range log request is checked against every prepared header, transaction identity and the freshly rechecked canonical tip; hash-pinned per-block reads remain supported. Commit event-containing blocks in order. Consecutive blocks with authenticated empty scoped log results may share one atomic transaction, retaining every canonical header, coverage row and block notification; reject conflicting retained logs and do not refresh timestamps on replay. Continue immediately when catching up; use the configured polling interval when idle. Retain bounded provider payloads and retries.

Compare parent hashes on every batch. On mismatch roll back orphaned events/materializations to a common ancestor within 64 stored blocks, then replay. If no ancestor is found, stop serving fresh quotes and mark resync required. Persist raw events so materializations can be rebuilt. Treat two blocks of confirmation as the app's display delay, not a claim of cryptographic finality; show pending receipts immediately and confirmed state after the configured delay.

Arc read freshness allows a current indexed cursor between two and eight blocks behind the observed head, with the existing ten-second index age bound. Other supported development profiles retain exact head-minus-two freshness. This bounded Arc allowance accommodates its observed subsecond blocks and RPC latency; it does not establish finality, accept unconfirmed pins, permit missing canonical coverage, or authorize spending from indexed data. API classifiers, shared wire schemas and SDK decoders use the same policy. Financial observations remain bound to one canonical block, rechecked source payloads and the existing twenty-second quote expiry; wallet review still validates current state, funding, simulation and minimum output. Normal monotonic index advancement may preserve an unchanged historical payment pin, while rewinds, same-height hash changes and unconfirmed final cursors fail closed.

Index only verified deployment emitters. A single swap is counted from one canonical successful router event; do not count both custom and stock swap events twice. Aqua `Pushed` at `ship` is allocation bookkeeping, not trade volume. Gas/native USDC logs are not extra swap payments. Use custom payment events for invoice fulfillment, not generic transfers to a merchant. Fees and mocked token volumes are identified separately; no fake USD price oracle.

Indexer runs read-only with respect to the chain. It publishes PostgreSQL notifications after commit; API uses those to send SSE invalidations. No Redis and no perpetual relayer signing loop. If indexed state is more than 10 seconds stale, label metrics stale and use fresh RPC calls for any quote; if RPC is unavailable, disable quote execution instead of supplying fixture values.

### 9.4 Operational defaults

Local Docker Compose provides Postgres, API, indexer, web and Anvil. Ports: web 3000, API 3001, Postgres 5432, Anvil 8545. Production artifacts are Dockerfiles for web/API/indexer plus database migrations; the master prompt does not choose a paid hosting account or publish without authorization.

Configuration: `DATABASE_URL`, `ARC_RPC_URL`, `CHAIN_ID`, `DEPLOYMENT_MANIFEST`, `INDEXER_START_BLOCK`, `PUBLIC_APP_URL`, `PUBLIC_API_URL`, and `LOG_LEVEL`. Deployment signatures come from the authorized browser wallet; deployment tooling, web, API and indexer do not read signer keys. Provide `.env.example` with names/descriptions and harmless local values, never real credentials. Use structured logs with request/chain/order/transaction IDs and latency; redact user-provided free text and secrets.

Arc browser viem/wagmi reads use the web origin's `POST /api/chain` route, which forwards only bounded, allowlisted reads and simulations to the verified runtime manifest's fixed RPC. Preserve exact canonical pins, calldata, revert data and no-cache behavior. Reject wallet/signing/broadcast methods, arbitrary upstream URLs/targets, state overrides and cross-site browser requests. This transport adds no account service or chain writer; user wallet providers still own signatures and submission. Local Anvil reads retain their existing transport. See D41 and the [browser RPC checkpoint](test/evidence/browser-rpc/README.md).

Required script names: `dev`, `build`, `lint`, `typecheck`, `test:contracts`, `test:reference`, `test:sdk`, `test:backend`, `test:e2e`, `test:invariants`, `test:all`, `verify:network`, `deploy:local`, `deploy:arc`, `demo:seed`, `demo:judge`, `db:migrate`, `db:replay`, `evidence:build`. Define them during scaffold and treat their actual configuration as executable truth. Avoid inventing passed command results in documentation.

## 10. Frontend art direction and design system

The following visual values are initial defaults, not immutable acceptance requirements. Follow docs/FRONTEND.md when redesigning. Keep feature controllers and SDK financial logic separate from typed presentational components.

### 10.1 Identity

The owner's latest September 9 instruction supersedes both the lavender template and the interim monochrome/neumorphic direction: build the identity around the supplied Orbital paper video and SVG logo. Use a deep blue canvas matching the video, warm light text, restrained chartreuse accents, editorial display type and fine diagram rules. Do not imply that Paradigm built or endorsed this application.

| Token | Value / use |
| --- | --- |
| `paper` | `#00131B`, video-matched page background |
| `surface` | `#0A222B`, transaction panels |
| `inset` | `#061A22`, input wells |
| `ink` | `#F2F0E7`, primary text |
| `accent` | `#C5F36B`, primary actions and selected states |
| `on-accent` | `#102019`, text on accent buttons |
| `muted` | `#A0B2B9`, secondary text |
| `outline` / `border` | `#45616B` / `#29414B`, control edges and separators |

These are editable defaults. Self-host Space Grotesk and Instrument Serif with their OFL notices; retain sans-serif, serif and monospace fallbacks. Use Space Grotesk consistently for application headings, navigation, forms, menus, dialogs and financial values; reserve Instrument Serif for the landing display headline and monospace for technical identifiers. Amounts use tabular numerals. Keep critical financial values at least 14px, AA contrast, visible focus, 44px control targets, reduced motion and responsive layouts. Status and errors must use clear words and semantic alerts, not rely on color alone.

Keep the landing introduction focused on liquidity, with immediate Swap/Provide liquidity actions and the actual supplied video. Credit the visualization beside its playback control. Header navigation covers Swap, Liquidity, Payments, Demo tokens (`/fund`) and Protocol notes (`/proof`), with active-page states; the supplied logo, wallet control and navigation remain accessible on mobile. The footer retains the paper, selected network and attribution from section 4. Funding also remains available from the wallet control. Show demo-token value disclosures on funding and relevant transaction reviews, including resumed publications before signing. Do not repeat them in a global banner, footer or passive invoice/strategy browsing. Preserve actionable safety, state, balance, approval, gas and risk warnings.

Use typed state and callbacks to redesign screens. Keep transaction reviews, warnings, pending hashes, recovery controls and truthful balances. Put raw identifiers, index observations, exact sub-token principal and backing details behind accessible disclosures. Do not remove underlying capabilities or silently change financial values while simplifying presentation. Optional invoice splits/reference fields may be collapsed before review; recipients and amounts must be visible in the signing review.

### 10.2 UI building blocks

Implement reusable presentation components for the app header, wallet control, network status, token/amount inputs, amount breakdowns, transaction steps, errors, empty states, strategy cards, tick profiles, inventory coverage, invoice summaries and evidence rows. Their variants derive from the token system; do not duplicate wallet, quote or transaction logic per page. Use the shared Radix `Select` for token, fee, expiry and status menus, with consistent portal popup styling, labeled triggers, keyboard/typeahead support, Escape dismissal, focus return and viewport collision handling. App-owned Radix dialogs share `components/Dialog.module.css`; preserve semantic title/description, focus trapping, a visible close control, Escape behavior and small-screen scrolling.

All inputs have persistent visible labels, localized human formatting with exact raw values available on demand, and field-level validation. Accept decimal input through a decimal-string parser; reject scientific notation, negatives, more fractional digits than token decimals, and overflow. Preserve the user's editing string; format on blur, never move the caret on every keystroke. Copy-address buttons copy the full checksummed address, not the truncated display. Token selectors show a clear name/symbol, with network, balance and address metadata available where relevant. Funding and transaction reviews identify demo assets; repeated mock badges on passive views are not required.

Disabled controls explain the next action. Successful copy uses text/icon for 1.5 seconds; errors persist until corrected or dismissed. Use persistent transaction state for approvals, submission and confirmations, with explorer links; a disappearing toast cannot be the only record of a transaction. Receipt links on invoices and strategies are directly visible; raw hashes and contract details may remain in disclosures. Pending/confirmed action links use the configured chain explorer, and local profiles retain full hashes. Back links, inline links and button links use consistent targets and styling; decorative elements must not intercept their clicks.

## 11. Compact, optional visual explanation

The landing page features the owner-supplied Orbital video and SVG logo with immediate Swap and Provide liquidity actions. The figure includes descriptive still-image text and a linked Paradigm credit. It is an illustration, never a quote or live pool chart. Educational detail remains available through the paper and protocol notes.

The old mandatory 420svh pin, exact timeline percentages and hard-coded camera choreography are superseded. Use the supplied video with a visible play/pause button; reduced motion starts on its still poster and offscreen/background playback pauses. Retain accessible equivalent text, poster fallback and no-script public browsing. Typography, spacing, exact copy, layout, section order, and decorative motion are editable defaults. Keep financial behavior, accessibility, route capabilities and truthful evidence mandatory. See [Frontend](docs/FRONTEND.md).

## 12. Swap page `/swap`

Use a centered dark swap panel with two inset asset wells and the shared video-derived visual tokens. Keep settings beside the title and route details in a disclosure. The network stays visible; relevant transaction reviews disclose demo-token status before signing. Exact layout dimensions are editable; no separate route sidebar is mandatory.

Card order: title + settings button; `You pay` amount/token/balance/Max; direction-switch button; `You receive` readonly quoted amount/token; route maker/preset row; price/fee/minimum-received/gas breakdown; main action; inline error/transaction stepper. Default display pair USDC → oUSD6; initial amount blank. A token switch swaps tokens and clears the computed output; it does not treat the previous estimated output as a confirmed new input.

Settings: slippage presets .1%, .5%, 1%, custom integer basis points 1–500 with an explicit warning above 100 bps; default .1% (=10 bps). Deadline default 180 seconds, selectable 60/180/600; stored per device, cleared only by reset. Contract maxCrossings defaults 16 and is visible in advanced route detail, not an ordinary user knob. Router traits always contain the actual caller's limits.

Debounce amount edits 300ms. Query only for positive valid input, distinct tokens and enabled chain. Older in-flight responses cannot overwrite a newer pair/amount/account request. Refresh a visible quote around every five seconds, earlier near expiry, while the tab is active and no review/signature/receipt workflow is in progress. Retry temporary expiry/index races within the request's existing timeout; continue background recovery with a fifteen-second failure backoff. Remove expired amounts after the twenty-second observation deadline. A background transport failure may retain a still-valid displayed estimate, but Review always obtains a fresh validated observation. Background refresh alone must not disable Review. Amounts do not animate when they change. Show how many strategies were compared and the selected maker; phrase “Best among the strategies checked,” not “Best price across DeFi.”

Default normal-swap approval is exactly the required input amount. Sequence: connect wallet → switch network → enter amount → approve if necessary → refresh quote → review → submit swap → pending → confirmed. Review displays input, minimum output, fee, router address, recipient, network and deadline. `minOut = floor(quotedOutput*(10000-slippageBps)/10000)`. If refreshed values violate the reviewed minimum or expire before submission, return to review; do not silently lower minOut.

For USDC Max, reserve `max(0.05 USDC, 2 × estimated remaining approval+swap gas cost)` using native gas units converted conservatively to ERC-20 raw units. Do not subtract gas from non-USDC token balances. Quote gas estimates show native fee in USDC; if unavailable, disable Max-to-entire-USDC-balance and give an editable conservative amount instead.

Primary-action state labels: `Connect wallet`, `Switch to Arc Testnet`, `Enter an amount`, `Approve USDC` (actual symbol), `Review swap`, `Confirm in wallet`, `Swap pending`, `Swap complete`. Error messages distinguish rejected wallet request, insufficient balance, insufficient gas USDC, unavailable maker inventory, docked strategy, expired quote, slippage, unsupported network, and RPC unavailable. A wallet rejection returns to the prior editable state and keeps the amount. A replaced transaction follows its replacement hash; a reverted receipt is never labeled complete.

Success shows actual input/output/fee and an explorer link, plus `Swap again` and `View receipt`. Do not use a pending UI amount as the confirmed actual result; decode the successful contract event. Route panel shows tick count, current interior/boundary classification, concentration preset, maker availability and source strategy link; show actual crossed keys/directions from the successful receipt. Do not invent crossing metadata in the upstream three-value quote return. Advanced technical details are collapsed by default.

## 13. LP pages and registration flow

### 13.1 `/liquidity`

Title “Your liquidity, still yours.” Body “Publish an Orbital strategy from your wallet. Tokens move only when a swap settles.” Primary action `Create strategy`. Disconnected state explains the model and offers connect without hiding the page. Connected state lists that wallet's active, inactive, retired and docked strategies with clearly distinct status.

Cards show token trio, preset, advertised principal, immediately available output inventory by token, fee rate, cumulative fees already received, last fill, and `Manage`. Fees are not APY. Empty state: “No Orbital strategies in this wallet.” CTA `Create your first strategy`. If the indexer is stale, show last indexed block/time and RPC refresh action; never call a missing indexed record a deleted onchain strategy.

### 13.2 `/liquidity/new`

Use a 760px-wide two-column form at desktop: 440px form plus 280px sticky preview. Mobile stacks the preview after inputs. Persistent steps at top: **Assets → Concentration → Review → Publish**. State survives reload under the unsigned SDK plan key.

**Assets:** select 2–8 distinct tokens from the verified deployment allowlist, with the first two selected by default. The current deployment offers USDC, oUSD6 and oUSD18, so any pair or all three can be selected. Show wallet balances, selected allocations and every supported trading pair; publication includes only selected tokens. Existing saved three-token drafts retain their exact configuration. Field `Allocate per asset` default 10 whole units. Show total nominal allocation and USDC gas reserve. Initial all-equal amounts are a deliberate strategy starting condition; no single-token deposit simulation. Identify demo assets on funding and strategy review instead of repeating no-value warnings in every asset row. Insufficient actual balances link to Circle's testnet faucet for USDC and the app's test-only mock mint flow for demo tokens. Faucet clicks are user actions, never a secret backend transfer.

**Concentration:** Wide/Balanced/Focused radio tiles, Balanced selected. Each shows the three funded-capital percentages from section 3, actual quantized threshold labels and a short risk sentence. `TickProfilePreview` uses the same pure SDK geometry outputs as config preparation; no unrelated decorative slider. Fee options 0.01%/0.05%/0.10%. Show estimated capital efficiency only if computed from the exact chosen profile and explicitly labeled “Model estimate near equal prices”; never annualize it into return.

**Review:** amounts by token; wallet custody explanation; full-range minimum; fee; allowance spender Aqua and bounded caps; app address; three tick keys/radii in advanced details; immutable configuration hash; expected steps; estimated gas. Required acknowledgements: “I understand that these allocations are not escrowed and other wallet activity can make them unavailable” and “I understand that a depeg can change the tokens and value I hold.” These acknowledge relevant user risks, not permission to alter the app.

**Publish:** visible per-transaction stepper listing needed token approvals (skip sufficient ones), `Publish allocation` calling Aqua.ship, and `Activate Orbital strategy` calling router activation. Each step shows pending/confirmed/rejected/failed, hash and retry control. Re-read state before each retry. If shipping succeeded and activation failed, do not prompt another ship under the same hash; offer `Resume activation` or `Deactivate allocation`. Display “Your tokens remain in your wallet” with before/after ERC-20 balances and note that USDC gas cost changes the wallet total.

On success navigate to `/liquidity/[strategyHash]` with a shareable read-only URL. No “LP token minted” or “Deposit successful” copy.

### 13.3 Strategy detail

Top: maker, token set, preset, network and status. Main section: principal inventory table, Aqua advertised allocation, wallet balance/allowance, effective availability, per-token cumulative fee received, and last updated block. Chart shows the three cap rings and current interior/boundary states from contract views. A compact activity table links recent swaps and exact fee amounts.

Owner controls: `Refresh`, `Update approval`, `Replace strategy`, `Deactivate`. Nonowners see `Swap against this strategy` and technical details only. Updating approval cannot change radius. Replace first retires/docks the old strategy and launches the new wizard with copied preset/size and a fresh nonce, clearly showing the temporary absence of that liquidity. Deactivation explains tokens are already in the wallet; it does not promise a withdrawal transfer.

Status model: Draft (local), Shipped/inactive, Active/available, Active/limited inventory, Retired/not docked, Docked. An insufficient allowance/balance is an availability state, not an irreversible invalidation; replenishment may restore fill availability without rewriting principal. Direct Aqua docking always disables quoting even if the backend has not caught up.

## 14. Payments and proof pages

### 14.1 `/pay`

Title “A stablecoin payment, settled.” Two tabs `Create invoice` and `Your invoices`. Create fields: USDC amount (default 5), expiry (1h/24h/7d, default 24h), primary recipient (connected merchant), optional second/third recipient with split bps, and an optional locally entered reference whose hash alone is put onchain. Default single recipient 100%; demo seed creates the specified 90/10 invoice. Validate positive amounts and exact 100% sum before requesting a wallet transaction.

Review shows immutable amount, recipients, split rounding rule, expiry, network and that private invoice documents are not stored. Successful creation returns the onchain invoice URL, copy button and explorer receipt. Backend login is unnecessary. Cancel is shown only to merchant on unpaid invoices; it is an onchain action.

### 14.2 `/pay/[invoiceId]`

Show merchant address, amount due in USDC, expiry, status, and recipient split. Wallet connected payer selects USDC/oUSD6/oUSD18; automatically calculate and display a read-only payment input from validated invoice quotes. For non-USDC input, display quoted input, Orbital fee, USDC settlement minimum, due amount and excess refund. Bound the read-only quote search by the active wallet's current token balance and the existing server limits. An optional spending limit under advanced options may lower that bound. Never assume unit parity establishes sufficient input, perform an unbounded search or approve the search ceiling. Review and approve only the exact quoted transaction input, then re-quote and present one `Pay invoice` action with a separate payment review. Gas remains separately checked. See D43.

Unpaid, expired, cancelled, pending and paid screens are separate. Paid screen reads the contract/payment receipt and shows actual payer input, USDC recipient transfers, refund, gas and explorer link. Refreshing or sharing the URL cannot replay payment. Invoice not found is an honest error with `Check network` and `Create invoice`, not a sample invoice. A direct USDC payment clearly says “No swap needed” and charges no curve fee.

### 14.3 `/proof`

This page is for judges and technical reviewers. It is public and factual. Sections: network/contracts with verification state and source links; unchanged upstream Aqua integration with explicit deployment provenance; custom opcode bytecode and rationale; all-pairs shared-state demonstration; crossing regression; wallet custody before/after; USDC payment and split receipt; tests/coverage/gas evidence with run timestamp/build hash; known limits.

For each criterion display Verified/Failed/Not run/Unavailable and a real artifact link. “Verified” must be generated from the evidence manifest for that build, not hard-coded in JSX. If no live deployment exists, show the local trace separately and keep Arc verification incomplete. Hide no failure by replacing it with illustrative graphics.

## 15. Application state, accessibility, and browser acceptance

Use explicit transaction state machines: idle, preparing, needsApproval, approving, readyForReview, awaitingSignature, pending, confirmed, rejected, reverted, stale. A strategy publication state machine also tracks each approval, shipped and activated. Persist only unsigned drafts and pending transaction hashes scoped to wallet+chain; reconstruct the rest from receipts. Two browser tabs must not assume exclusive wallet nonce ownership. Switching wallet/chain cancels pending unsigned plans and subscriptions but preserves already-submitted transaction links.

Frontend query keys include chain, wallet/caller, pair, amount, recipient and relevant entity version. SSE causes invalidation, never an imperative overwrite of financial inputs. Empty, error, partial/indexer-stale, offline and loaded states are designed for every data panel. Loading uses stable-size skeleton blocks, not fictitious financial numbers.

Accessibility acceptance: WCAG AA contrast at rendered sizes; semantic headings/landmarks; visible 2px focus ring; 44×44px touch targets; keyboard-operable dialogs/tabs/token selectors; focus trap and return; screen-reader labels for asset/amount/error/transaction status; no color-only status. Use `aria-live=polite` for infrequent status changes, not every streamed quote digit. Reduced motion works everywhere, and WebGL is decorative/aria-hidden with equivalent explanatory text.

Verify at 1440×900, 1280×800, 768×1024, 390×844 and 320×568. Financial actions remain reachable with mobile keyboard open, 200% zoom and long addresses/amounts. No horizontal page scroll. Modals use viewport-safe bounds; submit controls are not obscured by browser chrome. Test Chromium, Firefox and WebKit for the landing fallback and core forms.

Performance targets measured on the production build: landing LCP <=2.5s under a documented mobile-throttling profile, CLS <=.1, no avoidable long task above 200ms during standard form interaction, and no Three.js/GSAP scene chunk on transaction routes. Initial transactional client JS target <=250 KiB gzip excluding lazily opened wallet connectors; landing scene may add <=500 KiB gzip lazily. Record actual results and deviations; do not claim a performance score without measurement.

## 16. Mandatory tests before implementation

**Current execution order (owner instruction, 2026-09-08):** prioritize implementing the remaining workflows and getting the frontend, API, indexer and contracts working together. Keep immediate verification light: builds, types and focused smoke checks as needed. Defer broad regression campaigns, additional test coverage and optimization until that integration works. The release requirements below remain the later acceptance criteria; deferred checks are not passing checks.

The earlier mathematical suite remains extensive. The new integration tests must establish that the build truly uses Aqua and custom SwapVM rather than a superficially similar standalone AMM.

### 16.1 Contract and mathematical suites

| Suite / IDs | Mandatory observable result |
| --- | --- |
| `AQ-HASH` | SDK config/order bytes, Solidity hash and Aqua Shipped hash agree; maker/router/chain/nonce mismatch fails |
| `AQ-LIFE` | Approve/ship/activate changes no LP custody except gas; owner must be renounced before activation; inactive cannot quote; direct docking disables; retire terminal; fresh replacement cannot inherit old state |
| `AQ-PAIR` | One 3-token order successfully trades all 6 directed pairs, preserving one geometric state and selecting the actual requested output token |
| `AQ-OPCODE` | Actual dispatcher trace executes 0x72 then 0x52; each config argument is 32 bytes; unknown/repeated/reordered/trailing/stock mutation opcodes fail |
| `AQ-FEE` | Fee charged once on gross raw input, restored after terminal curve, received by maker, excluded from principal, counted once even across crossings |
| `AQ-STATIC` | Interface staticcall quote changes no storage/transient storage/logs and cannot initialize; quote and swap on unchanged state agree |
| `AQ-SETTLE` | Maker approves Aqua, taker router; exact input taker→router→maker and output maker→recipient; router zero net custody; failed transfer rolls back all state |
| `AQ-DONATION` | External Aqua.push raises surplus and leaves price unchanged; initial push cannot grief activation; wallet donations affect availability only |
| `AQ-SHARED` | Two strategies share a wallet; first fill can reduce second's availability; second safely fails/requotes; replenishment restores availability without curve reset |
| `AQ-SECURITY` | Same-order and cross-order reentrancy, read-only reentrancy, wrong trait flags, callbacks, exact-output/partial-fill/native-value requests, self-settlement, wrong app calls and token misbehavior fail |
| `AQ-ARC` | Genuine target USDC6 and native18 conversions correct; gas inventory accounted; no wrapper; actual target supports upstream lock opcodes |
| `PAY-ATOMIC` | Explicit input index selects the correct asset; adapter-context quote matches execution; USDC minimum, 1–3 exact recipient splits and current-payment-only refund all succeed together or all revert; prior adapter donations remain untouched |
| `PAY-REPLAY` | Double pay, cancellation race, expiry, wrong payer funding, malicious recipients, altered invoice terms, overflow and reentry cannot mark an invalid payment complete |
| `PAY-DIRECT` | Direct USDC path uses the same invoice accounting with no swap or curve fee |
| `MATH-RETAINED` | All applicable GEO/SW/crossing fixtures, including both roots, nonmonotonic tick path, virtual bounds and 700-state-style independent algebra corpus replaced by high-precision oracle evidence |
| `NUM-CERTIFIED` | Wide intermediate bounds, coefficient intervals, conservative output/raw rounding, root/domain failures and solvency proof from NUMERICS are implemented and tested |

Fuzz n=2,3,5,8 and ticks=1,2,3,8; reference-only n=32,100,1000,10000. Test token decimals0/6/8/18 in local model even though the default UI allowlist has three assets. Include differing radii over many orders of magnitude and minimum valid quantized cap widths. Tests of ordinary nonsingular valid configurations must not pass by rejecting most generated inputs.

Stateful handlers exercise multiple makers, all pairs, fees, docking, retirement, donations, approval depletion, wallet spending, shared strategies and invoice payments. Assert per-strategy geometric validity, principal/fee/Aqua separation, no cross-maker state leakage, complete rollback, and maker authority. End each sequence by retiring/docking every active strategy and confirming no user withdrawal claim is trapped in a pool contract.

Minimum campaign counts are inherited from TESTS: CI 2,048 fuzz cases and 256×128 valid-action invariant runs; release 10,000 fuzz cases and 1,024×256 runs for at least three seeds. Log successful inward/outward crossings, unique makers/pairs and reverts; fixed difficult fixtures supplement fuzzing. Required mutants: swapped price ratio, wrong aggregate boundary radius, endpoint-only crossing detection, wrong pair resolution, fee charged twice, raw Aqua balances used as geometric principal, quote writes enabled, retired-state reset, disabled global lock, and payment status written despite failed split. Every mutant must be detected.

### 16.2 SDK and backend tests

Golden byte fixtures for 68-byte program, 4-byte instruction args, 22-byte upstream traits header, order/config hashing, decimal conversions, bigint bounds, invoice IDs, and fork ABI. Round-trip serialize/parse every DTO without converting money to Number. Reject crafted unknown target/selector/recipient/network in transaction plans.

Backend tests run against isolated PostgreSQL and a local official Aqua/router chain. Verify idempotent event ingestion, Aqua ship Pushed events excluded from volume, duplicate swap logs not double-counted, native USDC/gas logs not duplicate invoice receipts, same block atomic cursor, restart, simulated reorg/replay, indexer lag, deleted RPC cache block, stale route invalidation, caller-dependent quote context, deterministic candidate limit/tie-breakers and cancellation of superseded requests. Rate/body/CORS limits and arbitrary-URL rejection have negative tests. Server must have no transaction-signing path.

### 16.3 End-to-end browser tests

Use Playwright with local-chain wallet fixtures for tests only; never ship a hidden production wallet or local private key to the browser bundle. Tests cover connect/wrong network, input parsing, token selection, exact approval, quote refresh/review, swap receipt, LP publish rejection/resume, inactive/docked strategy, limited maker availability, invoice creation, non-USDC payment, split/refund receipt, replay failure, account/chain switch, stale backend and failed RPC.

Screenshot the landing hero and optional educational states; swap idle/quote/review/success/error; LP steps and active/limited/docked detail; unpaid/paid invoice; proof with missing evidence. Run at desktop and mobile plus reduced-motion and WebGL-disabled. Verify text contrast, focus order, resize cleanup, no leaked canvases/timelines, no console errors, no clipped financial data, and no horizontal overflow. Visual tests supplement functional assertions; exact pixel snapshots are not a substitute for accessible behavior.

Mock mode is permitted only in explicit test/Storybook-like fixture routes not shipped as live financial state. Production live API failure must not fall back to seeded quotes, balances or verified badges.

## 17. Implementation milestones and acceptance gates

This plan supersedes the older pooled-contract P0–P8 plan. The owner's current integration-first order uses focused verification while implementation is completed; the broader exit suites below remain required to close each gate. Independent frontend scaffold and static design work may proceed while chain verification is blocked, but a live-looking mock does not complete a protocol gate.

| Gate | Work and dependency | Required exit evidence |
| --- | --- | --- |
| **G0: reproducible scaffold** | Read/pin sources; create monorepo, exact toolchain lock, schemas/ABI stubs, Docker/local chain, requirement matrix and network verifier | Build/test interfaces compile; meaningful behavior tests red; source commits and address verification status recorded |
| **G1: mathematical engine** | Independent per-tick high-precision reference, retained numeric library, sphere/cap math and both-direction crossing tests | Analytic fixtures/duality checks; conservative integer outputs; documented bounds/proofs; no unexplained valid-state reverts |
| **G2: actual SwapVM extension** | Minimal pair-resolution fork, canonical encoder, 0x72/0x52 dispatch, maker state and static quotes | AQ-HASH/PAIR/OPCODE/FEE/STATIC pass; all-pairs trace proves one shared state; upstream regression tests for preserved behavior pass |
| **G3: Aqua lifecycle/settlement** | Unchanged upstream Aqua local deployment; maker approval/ship/activate/retire/dock; controlled settlement and security | AQ-LIFE/SETTLE/DONATION/SHARED/SECURITY pass; no pooled deposits or contract fee claims |
| **G4: Arc payments** | Invoice adapter and real USDC chain adapter, local analog tests then target verification | PAY-ATOMIC/REPLAY/DIRECT pass; Arc identity/dual-unit tests; deployment eligibility clearly recorded |
| **G5: SDK/backend** | Canonical SDK, indexer, database, quotes, metrics, SSE, proof DTOs | Hash/calldata golden tests; ingestion/reorg/caller-context/rate/error tests; no signing service |
| **G6: complete application UI** | All routes, wallet/form state machines, supplied Orbital media and logo, fallback/reduced motion, Privy and external-wallet integration | All specified pages/states rendered; complete local wallet E2E; responsive/accessibility screenshots and checks |
| **G7: integrated qualification demo** | Seed distinct makers/taker/merchant/treasury; execute full scenario and build evidence | Actual source-backed opcode trace, all-pairs/crossing/custody proof, invoice split receipt, UI connects to that deployment |
| **G8: release candidate** | Full fuzz/invariant/mutation, gas/bytecode/performance/dependency review; authorized user-signed target deployment | Tests and measurements recorded, unchanged upstream target Aqua source/runtime/receipts verified with explicit project-deployment provenance, custom deployment identity recorded, no hidden failed criteria |

Do not add frontend simulations that claim to be certified quotes; reference math is for tests and explicit educational views. Do not drop the crossing solver to meet a demo deadline. If a mathematical proof fails, keep the counterexample and fix the responsible specification/implementation before declaring G1/G2 done.

Gas gate: record actual measured deployment sizes under the target bytecode limit; no unlimited-contract-size setting in qualifying evidence. Benchmarks include 3 tokens/3 ticks default no-crossing and double-crossing swaps, 8 tokens/8 ticks worst accepted traversal, invoice payment with three recipients and refund, and activation at maximum config. Default demo no-crossing target <=2,000,000 gas; worst supported traversal must fit the verified target transaction budget with at least 20% headroom. These are acceptance targets, not unmeasured claims. If they fail, optimize at existing seams; any lowered supported limit must be stated in manifest/UI/docs and justified by evidence, not silently advertised at the previous value.

## 18. Exact judging demonstration and evidence artifacts

Provide a deterministic local `demo:judge` script plus a manual browser runbook. Use separate maker A, maker B, taker/payer, merchant and treasury wallets. Local deterministic keys are confined to local tests. Live wallets come only from explicitly supplied signers or user-controlled Privy embedded-wallet sessions; no keys in public artifacts.

Demonstration sequence:

1. Print actual chain ID, Aqua source/address verification and deployment mode, custom router address, `AQUA()` binding, code identity, source commits and opcode bytes. Label the selected Arc registry project-deployed upstream AquaRouter, without implying canonical status or sponsor approval.
2. Fund makers with genuine testnet USDC (or clearly identified local USDC test fixture for local-only mode) and the two demo tokens. Show wallet token balances and token custody at Aqua/router before publishing.
3. Maker A publishes Balanced and maker B Wide, each with the default fee/config; record ship and activation receipts. Verify no LP token transfers into a vault on ship/activation; distinguish USDC gas expenditure.
4. Quote and fill each of the six directed pairs on a three-token strategy with small valid amounts. Demonstrate one actual inward/outward tick crossing scenario using independently prepared input amounts, not hard-coded output balances.
5. Show gross/net/fee principal separation and maker wallet receipt. Show a permissionless positive Aqua.push changes surplus without changing the curve quote at the same geometry.
6. Demonstrate limited inventory by a maker wallet spend/allowance reduction in the controlled demo, show honest unavailable status, then restore availability; no admin repair of geometry.
7. Create the 5-USDC 90/10 invoice. Pay using oUSD18 through the custom Orbital router. Show merchant 4.5 USDC, treasury .5 USDC, any payer refund and actual gas; prove a second payment reverts.
8. Retire/dock one maker strategy and show quote rejection while the maker retains wallet custody. The other maker remains independently active.
9. Open `/proof` and match UI receipts, opcode traces, requirements and deployment manifest to the script outputs.

Artifacts under `test/evidence/<build-id>/`: toolchain/source manifest; requirement results; numeric proof/range report; reference fixtures and seeds; contract test/fuzz/invariant/mutation results; fork diff; gas/bytecode report; network verification; deployment transactions; demo receipts and decoded transfers; opcode dispatch traces; UI screenshots; accessibility/performance results; and a short demo runbook/video storyboard. A video may be recorded if tools are available, but scripts and receipts are mandatory.

Track evidence matrix:

| Track requirement | What demonstrates it |
| --- | --- |
| Official Aqua source used | Verified chain-specific unchanged-source Aqua deployment, explicit project/canonical provenance, and direct ship/pull/push/dock receipts; sponsor qualification assessed separately |
| Sophisticated Aqua position | One maker's nested multi-token Orbital tick bundle and actual crossings |
| Modified SwapVM/custom instructions | Pinned upstream fork diff, deployed code, 0x72/0x52 dispatch trace and relevant negative tests |
| Position demonstrated through scripts/UI | Full local/target runbook and working LP/swap screens |
| Meaningful Arc and USDC | Arc transaction receipts, actual USDC ERC-20 settlement and gas-aware wallet handling |
| Programmable money flow | Atomic invoice threshold, recipient split, refund, cancellation/replay tests |
| Privy Best financial flow | Real embedded-wallet Orbital swap and invoice transaction, working code, public wallet-to-receipt association and UX explanation |

The user supplied the track description and prize figures; they are goals, not a guarantee of qualification or scoring. Do not claim sponsor approval, audit, endorsement, mainnet launch, unverified deployments, or integrations not implemented.

## 19. Agent workflow, constraints, and final handoff

Maintain `test/evidence/INDEX.md` with requirement ID, owner module, red/green tests, command, observed result, fixture/source provenance and blocker. Maintain PROGRESS.md for current gates and next actions. Keep source facts in the research notes, economic decisions here, math in MATH, arithmetic proofs in numerical evidence, and actual deployment facts in manifests. Use docs/PAPER_IMPLEMENTATION.md for traceability, docs/DECISIONS.md for material rationale, and README.md for verified setup. Do not create competing design documents with contradictory names or balances.

Before editing, inspect existing work and preserve unrelated changes. Use task-scoped edits. Do not reset or clean user work, commit/push without authorization, or expose secrets. Parallel agent work is used only when the user or applicable instructions authorize it; if used, assign disjoint files and serialize shared ABI/config changes. One owner integrates and verifies all results.

A discovered upstream incompatibility is handled with a concrete failing fixture and a minimal source patch consistent with this architecture; do not silently switch to a different protocol or old ABI. A missing external address/RPC/credential is an environmental gate. Continue local implementation, tests, UI and unsigned deployment artifacts, while accurately marking target-network completion pending.

Before any live deployment, finish the reviewable code, build artifacts and nonce-bound plan with focused verification in the owner's integration-first order; broader deferred tests remain open release obligations. Use only the explicitly authorized funded signer and verified Arc Testnet. The owner has authorized unchanged AquaRouter self-deployment; browser wallet transaction reviews provide the signatures without another sponsor-permission gate. A hackathon invitation alone supplies neither credentials nor mainnet authorization. Never use a local test mnemonic on the live network, substitute a mock registry, or describe a project-deployed address as the official canonical Aqua deployment. Documentation edits do not broadcast transactions.

Final implementation handoff must report: what works; exact entry commands; local UI URL; source and dependency pins; custom opcode meanings/bytes; verified addresses and deployment receipts; tests actually run and failures; numerical proof status; backend/indexer freshness; supported dimension/tick/work limits; demo instructions; and remaining external blockers. Link artifacts. Distinguish working local implementation, target-testnet verification and deployment, independent security audit, and production readiness.

Begin at G0. Carry the work through the gates with tests first. Deliver a coherent application whose visual explanation, strategy accounting, custom instruction execution and USDC payment receipts all describe the same system.
