# A mixed Orbital swap funds a USDC invoice

Verified locally on 2026-09-08: a genuinely initialized three-token/three-tick strategy executes its first outward crossing through the real Router, custom VM curve, and official Aqua, then atomically pays a split invoice through the unchanged OrbitalPayments adapter. This is a bounded integration regression, not full PAY/G8, Privy qualification, or Arc deployment evidence.

The fixture deploys immutable token metadata in actual sorted **6/18/6** address order using a bounded CREATE2 search. It computes the required activation amounts through directed initializer coefficients and checks the exact amounts and coordinate against the independently generated [reachable traversal fixture](../../packages/reference/fixtures/reachable-traversal.json). The runner binds the literal gross input, fee, payout, initial coordinate, funding, keys and radii before testing. The reference's historical generation-time labels remain unchanged; the present test provides the subsequent execution evidence for this one path.

| Value | Raw units (six decimals) |
|---|---:|
| Payer input | 350,000,000 |
| LP fee | 175,000 |
| Net curve input | 349,825,000 |
| Swap USDC output | 164,721,797 |
| Invoice amount | 150,000,000 |
| First recipient (90%) | 135,000,000 |
| Second recipient (10%) | 15,000,000 |
| Payer USDC refund | 14,721,797 |

Maker, payer, merchant, recipients and adapter are distinct roles. The adapter is the swap's taker and recipient; the invoice identifies the original payer. Both successful tests verify exact physical balances, Aqua allocations, principal/fee separation, version 1Ã¢â€ â€™2, actual boundary metadata and moments, one outward key `6442450944`, invoice fields, zero temporary approvals and cleared router pending storage. Prior adapter donations of 99 input units and 77 USDC units remain untouched. A repeated invoice payment rejects without changing the paid snapshot.

The second test enables a token rejection only after real activation. The second recipient transfer fails with the exact token error, after the mixed swap and first split. The complete pre/post strategy, invoice, token balances, supplies, Aqua allocations, nonces and approval snapshot matches. Restoring the token permits the same invoice and expected output to complete. These are tests of existing implementation behavior; no manufactured failing behavioral baseline or production change is claimed.

`python test/evidence/mixed-invoice/run.py` produced **2/2 GREEN** against an isolated copy of 98 source units with original compiler source-unit names. The final forced clean compile used solc 0.8.30, optimizer 700, viaIR and Cancun; it began `2026-09-08T08:53:57.947066+00:00`, compiled in 66.29 seconds and ran the suite in 138.96 milliseconds (runner 74.242 seconds). All recorded inputs were unchanged. The snapshot explicitly preserves the main build's unused stock SwapVM remapping so the artifact verifier accepts exact compiler settings. It uses its own out/cache and does not modify main artifacts.

The companion `pnpm --filter @orbital/sdk exec tsx ../contracts/test/mixed-invoice-receipts.mts` then ran against a new owned Anvil on chain 31337, with disposable unlocked accounts and no private-key handling. It authenticated metadata/source closure, exact ABI and link references, official Aqua's pinned source revision `81c26e4619ce21556ab02b3284ee2685de21fb18`, creation nonce simulation, linked runtime and immutable spans, and transaction/receipt/block identity. Source and artifact integrity were rechecked after the campaign. The isolated compilation's Storage runtime is 23,235 bytes; Router is 22,221, Composition 23,138, Endpoint 22,458, Payments 12,097. All deployed runtime nodes satisfy EIP-170. This authenticates this local compilation, not a main-artifact or external deployment identity.

The mined campaign started `2026-09-08T09:04:18.996Z` and completed `09:04:23.074Z`, with 30 setup/action transactions. Failed transaction `0xf900b0c28078aaf7c66298b3add9d0398aa8895c292c781fef25f9313d16de4b` has **status 0 and an empty logs array**. Its call trace returns the exact `RecipientRejected()` selector, confirms a completed real swap returning the expected gross/output/order, confirms the first successful split, and identifies the failing second-recipient transfer of 15,000,000 USDC. It consumed 5,366,757 gas, below its limit, and its complete pinned pre/post state digest matches.

After restoring the recipient, the same payment calldata succeeds in transaction `0x29ba0b4d8822adbe62eea5302ee231dca508fcf4d19b4845d67db84be4cccc16` with 4,973,226 receipt gas. Its canonical receipt contains exactly one matching OrbitalSwapExecuted followed by one InvoicePaid; decoded values and final custody match the table above. These are observed local transaction gas values including intrinsic gas, not Arc budgets. The process was stopped in `finally`; no persistent deployment manifest, local account service or frontend transaction enabling was added.

See the [Forge output](mixed-invoice/forge.txt), [run inputs](mixed-invoice/forge.json), [receipt/trace report](mixed-invoice/receipts.json), and [computation manifest](mixed-invoice/manifest.json). The [archive helper](mixed-invoice/freeze.py) authenticates all 100 archived source/config members before restoring them to a separate replay directory; `create`, `verify`, and `restore` are explicit modes. The archive contains neither build artifacts nor chain data. Rebuild the snapshot before rerunning the receipt companion; it deliberately rejects stale or incompatible artifact metadata.

The receipt companion also passes a focused TypeScript check using the repository's bundler module resolution: `pnpm --filter @orbital/sdk exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck --allowJs --checkJs false ../contracts/test/mixed-invoice-receipts.mts`. The JavaScript graph helper's default-root inference is widened locally to its documented validated string-FQN input; no helper implementation was changed.

The earlier mined probe pass was preliminary and its report was replaced by the final source-authenticated rerun above. The final rerun added explicit trace assertions for the completed router swap and first split, and followed the successful focused TypeScript check. Both probes passed; no behavioral RED is claimed. Only the final receipt report and its matching source hashes are retained.
