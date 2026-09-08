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
