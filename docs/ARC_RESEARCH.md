# Arc integration evidence

Reviewed September 6–7, 2026. This note records source facts, attempted verification, and the decisions adopted in [MASTER_PROMPT.md](../MASTER_PROMPT.md). It is not a deployment manifest.

## Network facts

Arc's documentation currently identifies Public Testnet as live and mainnet phases as upcoming. Use testnet chain ID `5042002`; do not label the supplied contract candidates “Arc mainnet deployments.” [Deployment model](https://docs.arc.io/arc/concepts/deployment-model)

The documented primary RPC is `https://rpc.testnet.arc.io`, explorer `https://testnet.arcscan.app`, and faucet `https://faucet.circle.com`. Older `.network` RPC URLs appear in earlier documentation; the build must validate its selected endpoint with `eth_chainId`. [RPC reference](https://docs.arc.io/arc/references/rpc-endpoints)

USDC's ERC-20 interface is `0x3600000000000000000000000000000000000000`, with 6 decimals. The native gas representation uses 18 decimals and refers to the same underlying asset. Do not double-count balances, wrap USDC, or use the native precision for ERC-20 approvals. A gas payment can reduce the inventory available to a wallet-owned strategy. [Stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)

EURC represents euros, while USYC represents a yield-bearing fund share; neither is an interchangeable one-dollar token for this specification's unweighted equal-peg invariant. The selected demonstration uses genuine testnet USDC and two explicitly labeled mock dollar tokens. That token choice is this project's design decision. [Contract and asset reference](https://docs.arc.io/arc/references/contract-addresses)

Arc documents differing native and ERC-20 balance/transfer semantics. Verify the actual target's EVM support, including transient storage needed by the pinned SwapVM, through its published compatibility reference and a target-fork integration test. Do not patch away reentrancy protection to make deployment succeed. [EVM differences](https://docs.arc.io/arc/references/evm-differences)

## Address verification status

The user's Aqua and router addresses are attributed to official 1inch deployment tables in [AQUA_RESEARCH.md](AQUA_RESEARCH.md). Their existence and implementation on Arc remain **unverified** here.

Attempted a read-only JSON-RPC batch to the documented primary endpoint for chain ID, block number, and code at both supplied addresses and USDC. The sandbox attempt failed DNS resolution. An approved network retry returned HTTP 403. Explorer-page retrieval was also unavailable. None of these failures establishes that contracts are absent. No transaction was submitted.

Required implementation evidence: chain ID, pinned block number/hash, address-specific code or documented system-contract identity, runtime code hash where applicable, source/build identity, Aqua ABI probes, and custom router's immutable `AQUA()` value. Do not accept an address string alone as evidence. A system-provided USDC interface may require chain-documented verification beyond a simplistic nonempty-bytecode check.

## Product decisions

Build a public-testnet demonstration with local Anvil tests, maker-owned liquidity, and an atomic invoice workflow: swap a supported dollar token into USDC, satisfy an onchain minimum payment, split proceeds to merchant recipients, and refund excess to the payer. Use the ERC-20 interface throughout application settlement. Display gas separately in USDC and reserve it when computing Max amounts.

No CCTP, Gateway, StableFX, Circle Wallets, or Circle App Kit integration is claimed unless actual code, configuration, and tests are added under a later explicit scope change. Arc plus genuine USDC settlement is the chosen Circle integration. Browser wallet connectivity is not evidence of using Circle Wallets or Circle App Kits.

## Client tooling sources

The application stack and version-family choices in the master prompt are project decisions. Verify patched, compatible exact versions when locking dependencies. Official references: [Next.js App Router](https://nextjs.org/docs/app/getting-started), [Next.js 16 changes](https://nextjs.org/docs/app/guides/upgrading/version-16), [Wagmi](https://wagmi.sh/), [Arc wallet integration](https://docs.arc.io/arc/references/connect-to-arc), [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), and [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/).
