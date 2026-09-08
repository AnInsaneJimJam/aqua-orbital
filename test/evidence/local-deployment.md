# Disposable local deployment and verification

Scope: a project-local, executable G7 prerequisite. It deploys the pinned Aqua source, the discovered immutable library graph, Orbital's router, its payment adapter, two demo dollars, and an explicitly local USDC fixture on an owned disposable Anvil instance. It does not complete G1, enable financial execution in the application, authenticate an Arc deployment, or verify live Privy qualification.

## Commands and output

```text
node scripts/local-deployment.mjs plan
node scripts/local-deployment.mjs test-run
node --test scripts/test/local-deployment.test.mjs scripts/test/local-deployment-integration.test.mjs scripts/test/local-anvil.test.mjs
pnpm --filter @orbital/sdk test
pnpm --filter @orbital/sdk typecheck
```

`plan` is read-only and requires current main Foundry artifacts. `test-run` owns and closes a new chain; it never attaches to the existing Anvil at port 8545. The strict CLI has no RPC URL, address, signer, fork, or output-path options. Root `deploy:local`, `deploy:arc`, and demo stubs are unchanged by this increment.

Each run creates a unique directory under `test/evidence/local-deployment/` using exclusive file creation. `report.json` retains the compiler source closure, artifact and runner hashes, unlinked templates, exact transaction input, constructor arguments, linked addresses, actual runtime bytes, receipt facts, final block, and checked configuration. `manifest.candidate.json` always has `verified:false`. No persistent deployment manifest, user environment file, API policy, or frontend execution flag is written. Failed verification also leaves a failure report and closes its chain.

## Authentication boundary

The graph walks the **union of creation and runtime link references**, deduplicates fully qualified library identities, sorts dependencies deterministically, and rejects cycles, missing nodes, conflicting source bytes and a graph larger than 64 nodes. Every root and transitive node uses the shared SDK artifact-integrity reader. Its exact pins remain Solidity `0.8.30+commit.73712a01`, Cancun, optimizer 700, via IR, IPFS metadata, seven effective remappings, and an unlinked compiler library map. Current source bytes must match every declared compiler metadata source. Aqua's acquisition manifest is additionally bound to `1inch/aqua` commit `81c26e4619ce21556ab02b3284ee2685de21fb18`, including every retained Aqua file and each Aqua source in the graph.

Link positions must match the exact compiler FQN placeholder and the address of a dependency created by this run. Creation bytes plus encoded constructor arguments must fit 49,152 bytes; every runtime must fit 24,576 bytes. Immutable spans must be 32-byte zero placeholders within the compiled runtime, disjoint from other immutables and links. Repeated immutable identifiers must have identical actual values.

This is local **declared compiler-output/source consistency**, not a proof that the compiler or its recorded metadata is honest. Artifacts and source closures are read before deployment and re-read after verification; equality is required. This is a dated build observation, not an atomic filesystem snapshot. The pinned compiler and the locally launched Anvil remain trusted execution components. Their version/configuration and Anvil binary hash are recorded.

The runner patches already compiled unlinked binaries, retaining the compiler's original metadata and recording every patch. It does not claim to reproduce an explorer's compiler-linked metadata build. Solidity documents both FQN linking and constructor replacement of immutable references. [Solidity 0.8.30 compiler output and linking](https://docs.soliditylang.org/en/v0.8.30/using-the-compiler.html), [immutable values](https://docs.soliditylang.org/en/v0.8.30/contracts.html#immutable).

## Explicit library artifact mode

Ordinary contract ABI checks are unchanged. Library mode is selected only for graph dependencies, never as an automatic fallback after an ordinary ABI failure. It requires an authenticated exact top-level `library Name` declaration; a comment/string-aware scanner rejects contract opt-in, spoofed names and nested declarations. Library ABI entries still match metadata exactly, including ordered arguments and internal types. Represented signatures use named struct/contract types, and every declared selector must equal the first four bytes of its exact signature's Keccak hash.

The compiler omits stateful library functions and functions with storage parameters or returns from JSON ABI. Their declared selector-map completeness therefore remains a compiler-output assumption. For stateful libraries, the compiler's `library_deploy_address` zero span is required and its deployed value must equal the derived creation address. Pure/view math libraries can optimize this guard away; this bounded mode requires every declared method to be accounted for by a pure/view ABI entry when no self-address span exists. Unsupported library types or unrepresented methods in that mode fail closed. [Library calling conventions](https://docs.soliditylang.org/en/v0.8.30/contracts.html#function-signatures-and-selectors-in-libraries), [pinned compiler ABI.cpp lines 46–50](https://github.com/ethereum/solidity/blob/v0.8.30/libsolidity/interface/ABI.cpp#L46-L50).

## Owned chain and exact verification

Anvil starts hidden and quiet with a sanitized environment, random development accounts, a temporary empty working directory, chain 31337, Cancun, and a 30,000,000 gas limit. An OS-selected loopback port cannot be 8545. The runner checks process liveness, the actual Anvil client, instance ID, no-fork configuration, zero initial nonces, and a genesis timestamp/base-fee challenge. Instance and genesis identity are checked before writes and after all observations. RPC reads have a 15-second timeout, an 8 MiB fixed response buffer and a monotonic body deadline; the owned chain has a five-minute run deadline. Shutdown targets only this child process and is awaited.

Transactions use an unlocked account obtained from that owned chain. No externally supplied sender or address is accepted. Before each creation, the runner simulates the **exact linked initcode and constructor arguments** using `eth_call` without `to`, with explicit sender and current nonce. The two-nonce self-address probe verifies this behavior on the installed Anvil: simulation leaves the nonce unchanged and returns the same CREATE address embedded in actual deployed runtime. Every actual runtime must equal its simulation byte for byte, and must separately match the linked artifact outside the validated immutable slots. Receipt/transaction checks bind sender, zero value, chain, nonce, exact input, target or derived creation address, gas, block hash/number and canonical inclusion.

The final hash-pinned reads check Router Aqua/WETH/chain/owner, EIP712 fields, and an independently computed EIP712 hash probe exercising the cached domain; Payments USDC/router bindings; all token decimals and allowlists; demo token names, caller faucet amounts, balances, total supply and cooldown timestamps. Router ownership is renounced through a checked receipt. All contract code and all receipt blocks are rechecked at the end.

The local USDC contract is a test fixture, not Circle-issued or Arc-native USDC. It inherits the fixed caller-only 1,000-token faucet and daily cooldown, exposes explicit `USDC.fixture` metadata, has no arbitrary mint function, and rejects deployment outside chain 31337. Arc's native-USDC gas behavior is not reproduced.

## Verification record

The final deployment verification passed after the root-owned main contract build froze. [Complete report](local-deployment/2026-09-08T08-47-12.753Z-38942006-0d13-470a-a253-c68d74e87458/report.json) SHA-256: `d5b180f29030f8520df7ae17372589800cccacd349d992fe50db10f79d1bdb88`. Its chain was local 31337 on port 55137, Anvil 1.5.1, Cancun. All 12 creations and 16 receipts passed; all linked code and immutables matched, final bindings and faucet balances matched, and the process closed. The companion candidate remains `verified:false`.

The linked runtime sizes were Router 22,221; Storage 23,240; Composition 23,138; Endpoint 22,458; Codec 8,153; Initializer 7,049; Settlement 6,658 bytes. All fit EIP170. Deployment-only gas observations in the report do not establish swap gas, mathematical coverage or Arc gas limits.

Final integration: `local-deployment-integration.txt`, 1/1 passed, 2,778.4216 ms test time. Local graph/receipt/immutable/Anvil suite: `local-deployment-unit.txt`, 9/9 passed. Artifact helper suite: `local-deployment-library.txt`, 16/16 passed, including all 12 ordinary checks. After ABI regeneration, full SDK: `local-deployment-sdk.txt`, **76/76 passed**, zero failures, skipped or cancelled tests, 16,186.3444 ms TAP duration; SDK typecheck passed in `local-deployment-sdk-typecheck.txt`. The root-authorized `sdk-green.txt` checkpoint now contains this full pass, with its previous 72-test output preserved separately. Final owned-source hashes are in `local-deployment-sources.json`. Retained development steps:

- `local-deployment-red.txt`: 6 pure graph/link/immutable/network/CLI failures against the initial stub.
- `local-anvil-red.txt`: constructor simulation/owned-node probe failed against its stub; later passed at two consecutive creation nonces.
- `local-deployment-integration-red.txt`: full integration failed against the runner stub.
- `local-deployment-library-red.txt`: 12 prior artifact checks passed and 2 new library checks failed before library support.
- `local-deployment-pure-library-red.txt`: pure-library/source-identity checks failed before their implementation.
- LocalUSDC: 2 RED failures in `mixed-execution/red.txt`; 2 GREEN in `mixed-execution/green-refactor.txt`, then retained in the agent's final 88-test campaign.
- `local-deployment-sdk-preliminary.txt`: 74/76; only existing event-provenance hashes were stale while the production source changed. SDK typecheck passed. These are not counted as a completed SDK regression.
- `local-deployment-integration-preliminary.txt`: all 12 contracts were deployed and byte-verified, then the initial nested domain comparison failed on address checksum casing. The per-field comparison was corrected. The failure report remains in the run directory dated `2026-09-08T08-35-56.917Z`; it is not a successful deployment verification.

Receipt artifacts establish only this disposable local deployment and its listed checks. No strategy shipping, swap, invoice payment, frontend wallet flow or sponsor qualification is implied by these deployment receipts.

Independent read-only reviews: root reviewed the explicit library mode and final runner; backend reviewed owned-node lifecycle and deployment verification. Neither reported a concrete scoped defect after the documented fixes. The reviews retain the local compiler-output and owned-Anvil trust assumptions above.
