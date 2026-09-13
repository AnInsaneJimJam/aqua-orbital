# Arc project deployment preparation

Checkpoint: 2026-09-09. This records preparation and read-only simulation, not completed deployment or sponsor qualification.

The owner explicitly authorized deployment of unchanged upstream Aqua on Arc Testnet. The new mode deploys `vendor/aqua/src/AquaRouter.sol:AquaRouter` from pinned revision `81c26e4619ce21556ab02b3284ee2685de21fb18`, preserving its upstream simulation, batching and rescue helpers. The deployment wallet owns that helper; the custom Orbital router still renounces ownership. This is a project deployment at a project address, not canonical 1inch Aqua.

## Observed checks

- `forge build --root packages/contracts vendor/aqua/src/AquaRouter.sol`: passed with pinned Solidity 0.8.30 and repository settings; three files compiled.
- Deployment module, CLI, HTTP server and inline browser script syntax: passed.
- Source/artifact authentication and twelve-step unsigned plan reconstruction: passed. The original eleven-step existing-registry plan was retained.
- Arc preflight: chain 5042002, system USDC code/six ERC-20 decimals, public deployer balance/nonce and empty predicted registry address passed. No canonical-Aqua/sponsor-evidence blocker applies to this explicit mode.
- First constructor `eth_estimateGas` and `eth_call` against Arc: passed. The simulated 3,778-byte runtime matches the authenticated compiler output. Reviewed maximum gas cost was `0.044005836359301696` testnet USDC; this is one step's maximum, not the complete deployment budget.
- Operator HTTP page and `/api/status`: HTTP 200, `phase: ready`, `aquaDeployment: project-deployed-upstream`, `confirmed: 0`, `total: 12`, no blockers.
- Focused independent code review covered schema-1 compatibility, sequential nonce/receipt checks, post-creation Aqua runtime verification, owner bindings and downstream manifest use. No sequencing defect was identified. Corrected legacy-mode copy so an unverified existing registry is not described as authenticated.

[Machine-readable preparation and simulation](arc-integration/self-aqua-preparation.json) records the plan identity, predicted addresses, source artifact identity and observation block. Predicted addresses are not deployed addresses until matching receipts/runtime are verified.

## Required continuation

The operator page at `http://127.0.0.1:3100` requires wallet `0x5eBA55e1b43c8714E4432250Dada7A518780C871` to review/sign twelve individual transactions. It preserves submitted hashes and checks each canonical receipt and deployed runtime before offering the next transaction. Activation additionally checks AquaRouter helper ownership, batching, router renunciation/domain/Aqua binding, payments and token bindings. It writes the verified manifest only after completion.

At this checkpoint, zero transactions are confirmed and no activation occurred. Remaining linked constructors cannot be simulated on the real chain until their dependencies are deployed. No authenticated Privy wallet, Orbital swap or swap-funded invoice on Arc is claimed. Full numerical, security, gas, accessibility and release campaigns were not run for this increment.

See [deployment steps and recovery](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/ARC_DEPLOYMENT.md), [live application profile](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/docs/ARC_DEMO.md) and [progress](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/PROGRESS.md).
