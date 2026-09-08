# Privy integration and qualification

Decision: target **Best financial flow** only. Orbital’s mechanism remains central. A Privy embedded EVM wallet must execute a real Orbital swap and the existing invoice flow. A login button, external-wallet-only demo, or mocked wallet is not qualification evidence.

## Primary sources

Reviewed 2026-09-08:

- [React quickstart](https://docs.privy.io/basics/react/quickstart): authentication, embedded-wallet creation and user-requested transactions.
- [wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi): Privy drives connectors; use its createConfig/WagmiProvider and normal wagmi action hooks. Explicitly choose the active wallet.
- [EVM networks](https://docs.privy.io/basics/react/advanced/configuring-evm-networks): configure supported/default chains and RPC transport. General EVM support is not proof of a working Arc deployment.

## Product boundary

One wallet control offers existing-wallet connection and email sign-in. Embedded wallets remain user-controlled, with explicit financial review and wallet confirmation. No application private-key storage, server signing, delegated signers, unattended transactions, smart-account dependency, gas-sponsorship claim, Cards, or B2B administration is added.

Use the SDK’s canonical plans for either wallet type. Provider code stays in the frontend wallet module. The application API and indexer remain public/read-only with respect to chain writes; no user/email database is needed. Public environment configuration includes `NEXT_PUBLIC_PRIVY_APP_ID`; dashboard configuration must allow the actual local/deployed origins and email authentication. No app secret belongs in the browser.

Arc is the live target; local Anvil fixtures are a separate explicit development profile. If Privy is not configured, show an honest availability state and allow the external-wallet development profile. Never call that a verified Privy flow.

## Evidence and tests

Create/reuse an actual embedded wallet; record its public address and wallet type without email/session credentials. Use it for the router approval and swap, then adapter approval and invoice payment. Link transactions, decoded transfers and source. Show how integrated signing supports the existing trading flow.

Test active-wallet selection, reconnect, rejected login/signature, wrong chain, insufficient USDC gas, receipt failures, account switching, stale quotes, and resumed publication. The required live run remains separate from mocked browser tests. Track eligibility is based on the user-supplied requirements; no scoring weights or sponsor acceptance are assumed.

## Observed configuration

The owner supplied public app ID `cmtrvczqp00qh0cjv4b16j1ag` on 2026-09-08. It is configured locally in ignored `apps/web/.env.local`. The email and external-wallet login dialog rendered at `http://127.0.0.1:3002`; [observation](../test/evidence/privy-login.json) and [screenshot](../test/evidence/privy-login.png). This validates public configuration/loading only. No email address or authentication token was collected, and no embedded wallet or financial transaction has been verified.

For a different origin, configure it in the Privy dashboard before testing. Keep email authentication and EVM wallet creation enabled. The application uses `useSetActiveWallet` for an explicit selected wallet and Privy `logout` rather than wagmi's disconnect shim in the Privy profile. Source: [official wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi), reviewed again on 2026-09-08.

`pnpm test:e2e` starts a separate development server with an empty public app ID and injected wallet fixtures. These tests cannot count toward live Privy eligibility. SDK transaction-port tests likewise verify application behavior, not the hosted Privy service.

## Payment execution boundary (2026-09-08)

The invoice controller now uses the same imperative wagmi identity and transaction bridge for either wallet type. Its review is reconstructed locally, checked against a canonical live invoice and token balances, simulated without state overrides, and submitted only on the user's explicit action. Exact token approval and payment are separate reviews; the browser fetches a new payment observation after approval. Saved public transaction data supports receipt recovery without signing again. No identity or email field was added to the API or invoice.

Arc exposes native USDC at 18 decimals and ERC-20 USDC at six decimals over the same balance. The payment review therefore reserves `amountRaw * 10^12` native units in addition to its gas budget when the input is Arc USDC. Local Anvil ETH and non-USDC input assets remain distinct inventories. This is an implementation of the [official stablecoin model](https://docs.arc.io/arc/concepts/stablecoin-native-model), checked on 2026-09-08; it is not a live Arc funding observation.

The installed viem 2.56.3 `call` API supports `blockHash` with `requireCanonical`; invoice/allowance reads and simulation use that option. The browser separately rechecks canonical block hashes around gas estimation. The [official fee action](https://viem.sh/docs/actions/public/estimateFeesPerGas) supplies EIP-1559 maximum and priority fees, which are passed with the reviewed gas limit to the wallet. A changed budget requires another review. This adds no gas sponsorship or commercial Privy feature.

Live embedded-wallet creation, reconnect, rejection, active-wallet selection and financial receipts are still unverified. The new browser transaction fixture is an application behavior check only. The deployment manifest and numerical/target release obligations remain separate prerequisites for a live demonstration.

## Standalone swap boundary (2026-09-08)

Standalone swaps now use the same imperative wallet identity/send bridge, canonical RPC simulation and gas-budget checks as invoice payments. Exact router approval requires a separate fresh swap review. Recovery binds the saved public transaction and decodes actual Orbital settlement events before displaying success. [Application fixture evidence](../test/evidence/swap-flow.md). This adds no provider-specific contract, backend account or private-key handling. Embedded-wallet creation, reconnect and live swap/payment receipts remain unverified.

The shared transaction bridge now requests network changes through the current wagmi connector. Local browser fixtures cover successful and rejected requests; they do not establish Privy embedded-wallet chain switching. Device swap settings and public balance reads add no identity fields or provider account service. Gas-aware USDC Max uses actual candidate simulation and retains unavailable gas explicitly when future approval prevents that simulation. [Controls](../test/evidence/swap-controls.md).
