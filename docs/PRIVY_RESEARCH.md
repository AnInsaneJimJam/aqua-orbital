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

Invoice creation and merchant cancellation also use this same wallet bridge, with explicit zero-token-value actions, reviewed gas, nonce/status rechecks and canonical event recovery. Plain reference text is hashed locally and omitted from recovery storage. [Application checks](../test/evidence/invoice-admin.md) use injected wallet/RPC fixtures; no additional Privy capability or live qualification is claimed.


## Current integration increment

Rechecked the [official wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi) on 2026-09-08. When Privy has loaded connected wallets but wagmi has no valid active wallet, the bridge restores a device preference or selects the embedded wallet, then the first available wallet. It preserves an already active wallet. Selection remains editable in the shared wallet control. Login, wallet creation and all financial signing still belong to the user.

The [official Arc connection reference](https://docs.arc.io/arc/references/connect-to-arc) identifies the [Circle faucet](https://faucet.circle.com) for testnet USDC. The funding page links to it and labels local USDC fixtures separately. This adds no onramp, gas sponsorship or commercial feature claim.

The integrated browser receipts in this increment use explicit Anvil fixtures. They prove application-to-contract wiring locally, not Privy wallet creation, reconnect, hosted signing or sponsor eligibility. The public app ID remains configured; live authentication is still required.

## Live onboarding preparation (2026-09-09)

The shared wallet control now offers **Create a Privy wallet** to authenticated users who do not already have an embedded Ethereum wallet, including users who originally signed in with an external wallet. This is a user-triggered `useCreateWallet` action without additional signers. Existing linked embedded wallets are never replaced as a reconnection workaround. Email login continues through Privy's own modal with `createOnLogin: 'users-without-wallets'`. The [automatic creation guide](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation) distinguishes this modal behavior from custom login hooks; the [manual creation API](https://docs.privy.io/wallets/wallets/create/create-a-wallet) supplies the explicit action for existing accounts.

Successful creation or an explicit connection requests that wallet as active once Privy's wagmi connector is available. The bridge also listens for connector readiness during restoration, preserves an already active wallet unless the user requests another, and reports interrupted login, connection and creation as recoverable states. The no-app-ID profile still uses injected external wallets. These paths share the existing reviewed transaction bridge; no new financial controller or backend identity service is introduced. The SDK's [documented active-wallet API](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi) remains the selection boundary.

The Privy modal uses the supplied Orbital logo and Ethereum-only wallet choices. Arc chain metadata includes ArcScan, as required by Privy's [custom EVM network configuration](https://docs.privy.io/basics/react/advanced/configuring-evm-networks). `NEXT_PUBLIC_ARC_RPC_URL` can select the public Arc RPC configured by the Arc runner; the default remains `https://rpc.testnet.arc.io`. Use an endpoint safe to publish in browser code. The [Arc connection reference](https://docs.arc.io/arc/references/connect-to-arc) supplies chain ID 5042002, native USDC with 18 decimals, ArcScan and the testnet faucet.

### Owner actions for the live run

1. In the Privy dashboard, select the already supplied app and keep email login, Ethereum wallet login and embedded Ethereum wallets enabled. The public app ID is sufficient for this client integration; no app secret or signing key is needed by Orbital's frontend or API.
2. If the app restricts origins, add the exact Arc frontend origin (the `dev:arc` runner uses `http://127.0.0.1:3002`; add `http://localhost:3002` only if using that hostname). Dashboard location: **Configuration → App settings → Domains → Allowed origins**. Use the actual HTTPS origin when hosting. Development apps without origin restrictions do not need an allowlist merely for local testing. [Official allowed-URL configuration](https://docs.privy.io/recipes/dashboard/allowed-domains).
3. Open the Arc profile, choose **Connect wallet**, and complete email verification personally inside Privy's modal. An account without wallets should create one during this flow; an external-wallet account can use **Create a Privy wallet** in the shared wallet control. Select the row labeled **Privy wallet**. Reload once and confirm the same public address reconnects. Do not share email codes, sessions or recovery material.
4. Fund that public address with testnet USDC using the [Circle faucet](https://faucet.circle.com), keeping enough USDC for gas. Once the verified Orbital deployment and liquidity exist on Arc, personally approve the bounded token allowance and reviewed swap, then the reviewed swap-funded invoice. Save public addresses, chain ID and receipt hashes as evidence.

The missing live observations are still wallet creation/reconnection, embedded signing and actual Orbital swap/payment receipts. Code readiness and public login configuration alone do not close sponsor eligibility. Target Aqua/deployment availability remains a separate prerequisite; it cannot be resolved by adding Privy credentials. `pnpm --filter @orbital/web typecheck` passed (exit 0) for this increment. Broader wallet and release campaigns remain deferred.
