# Demo-token faucet and reviewed transaction

Observed 2026-09-08. This is a local contract/SDK checkpoint, not a deployed faucet or Privy financial-flow claim.

`OrbitalDemoDollar(uint8)` creates either Orbital Demo Dollar 6 (`oUSD6`) or Orbital Demo Dollar 18 (`oUSD18`). Precision, amount and deployment chain are immutable. Only chain 31337 and Arc Testnet 5042002 are accepted. The single `faucet()` action mints exactly 1,000 whole units to its caller and advances that address's `nextMintAt` by 24 hours. It accepts no amount or recipient and has no owner or arbitrary mint function. Ordinary ERC-20 transfers and approvals use the pinned OpenZeppelin implementation. Demo tokens have no redemption value; this per-address cooldown is not Sybil resistance.

The SDK's `buildDemoFaucetTx` validates the deployment, active account/network and manifest's exact demo-token identity. Settlement USDC, unknown tokens, non-demo metadata and future cooldown timestamps fail review. The result contains only the token's compiled `faucet()` selector, zero native value and the reviewed account. `validateTransactionPlan` reconstructs that same intent and rejects altered targets, calldata, accounts, chains, labels, native value and additional fields. It uses the existing wallet gas/identity/receipt boundary; no backend signer is added. The current frontend template was not changed.

The caller must read `nextMintAt(account)` from the selected token at a confirmed block and use that chain timestamp. The verified deployment must authenticate the faucet implementation, immutable chain and metadata; pure SDK validation cannot authenticate RPC or bytecode itself. A stale cooldown observation may still produce a contract revert, which must be handled through the ordinary transaction flow.

## Observed checks

- Contract RED: 7 expected failures against the initial compiling stub, retained in [demo-dollar-red.txt](demo-dollar-red.txt).
- Contract GREEN: `forge test --root packages/contracts --match-contract DemoDollarTest --fuzz-seed 0x20260908`, **7/7 passed** in [demo-dollar-green.txt](demo-dollar-green.txt). Tests cover both precisions and permitted chains, invalid precision/chain, timestamp zero, the exact daily boundary, address-local cooldown across transfers, standard allowance behavior, runtime chain drift and early-retry fuzzing. This uses the local fuzz profile, not a release campaign.
- SDK RED: 6 expected failures before implementation/ABI generation, retained in [sdk-faucet-red.txt](sdk-faucet-red.txt).
- SDK GREEN: `pnpm --filter @orbital/sdk test`, **44/44 passed**, including 6 new faucet tests in [sdk-green.txt](sdk-green.txt). `pnpm --filter @orbital/sdk typecheck` passed.
- `pnpm --filter @orbital/sdk exec node scripts/generate-abi.mjs` succeeded. The separately recorded [demo-token ABI provenance](../../packages/sdk/src/generated/demo-token-provenance.json) retains compiler 0.8.30, Cancun, optimizer 700 and via-IR, plus current source hash and selectors. Existing ABI groups remain intact.
- An independent read-only contract review found no concrete defect; that review did not run additional tests.

## Source identity

| Source | SHA-256 |
| --- | --- |
| `packages/contracts/src/OrbitalDemoDollar.sol` | `5a0140e4bd04c49f8a2c46f5b877bd68e5829aeed504774b966e6f2af60260c9` |
| `packages/contracts/test/DemoDollar.t.sol` | `8c83228596c0e821ec35bb048912d30fa8b6e33d957462bca1ec629e4a5295ab` |
| `packages/sdk/src/plans.ts` | `47b2c93b1bca1a29a262eea735118b563917935c269b1d70ac2c06bdd2c8a518` |
| `packages/sdk/test/faucet.test.ts` | `21435d12ff1d424c71a99ad885d8086a48e127e36456d41dbd79615c0bf915cf` |
| `packages/sdk/scripts/generate-abi.mjs` | `e566f43cf07d6ddc990248c04208556b5ff59c09c6b7a5a9a26dd10af1e4f4ff` |

Live deployment verification, user wallet mint, complete frontend faucet workflow and Arc/Privy receipt evidence remain outstanding.
