# Once-per-swap input fee instruction

2026-09-08 checkpoint. Production `0x72` dispatch charges the immutable maker fee,
runs the remaining canonical terminal instruction on net input, requires exact
net consumption and complete arguments, then restores gross. Only nonstatic
execution increments the input asset's raw fee counter; geometry is untouched.
The full protocol still requires curve and settlement integration.

For the three permitted rates, `e = ceil(g*p/1_000_000)` uses an exact 512-bit
product. Accepted inputs obey `(e-1)*1_000_000 < g*p <= e*1_000_000`,
`0 < g-e`, and `e+(g-e)=g`, including near-maximum uint256 input. No fee is
recomputed from a partial fill. Empty protocol-fee metadata, receivers and total
are all required: upstream surplus receivers can collect despite `feeTotal=0`.

## Verification

- Compiling stub run: four of six tests failed for the intended unavailable
  arithmetic/dispatch; two rejection-only tests already passed. Raw log:
  [fee-instruction-red.txt](fee-instruction-red.txt).
- Additional regression was observed failing when nonempty surplus metadata was
  checked only through `feeTotal`: [fee-surplus-red.txt](fee-surplus-red.txt).
- Corrected run: **7 fee tests and 22 lifecycle tests pass**; fee fuzz recorded
  257 cases at the local profile. [Raw output](fee-instruction-green.txt).
- Six-pair static quotes use a **test-only `net/2` curve probe**, to isolate the
  actual fee wrapper. The instruction-only harness observes fee storage without
  transfers. Neither is a real Orbital quote or settlement demonstration.
- A call through the actual upstream transfer path then fails the production
  post-settlement placeholder; token balances and fee storage roll back.
- At this checkpoint, production runtime is **23,654 bytes** under the pinned
  Solidity 0.8.30, Cancun, via-IR, optimizer-700 build. The EIP-170 regression
  deploys and measures the real production router. The test guard subclass has
  extra state-mutation methods and is not a deployment artifact.

Source SHA-256 at the above checkpoint:

| File | SHA-256 |
| --- | --- |
| `src/OrbitalSwapVMRouter.sol` | `da5e8fd2f40cb83006eb87f3eb346a12bce01e42d88b927b09fb0b2e56c3ee54` |
| `src/libraries/OrbitalStorage.sol` | `1d45f4d9c0dbe6d460f3a98e5ea20cd9005b0194e2409a1a9e75180ef07b031c` |
| `test/FeeInstruction.t.sol` | `0823ad6019865701965e1ed241a17a0fe4ba52fd482cf907aa8c90fc5bc7317a` |

Later integration must repeat size, real-curve quote/swap parity, transfer deltas,
post-backing, reentrancy, event and rollback checks. These focused results do not
close G2/G3 or establish a live Privy flow.
