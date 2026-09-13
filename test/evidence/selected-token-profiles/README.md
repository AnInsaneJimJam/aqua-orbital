# Selected-token liquidity builder

The builder accepts 2–8 distinct assets from the verified deployment manifest. The current Arc deployment has USDC, oUSD6 and oUSD18, so the available choices are any pair or all three. It defaults to two tokens. Equal initial amounts and the existing three-tick profiles remain unchanged; no production contract, deployment or allowlist changed.

The SDK derives cap keys, radii and displayed single-coin reference thresholds from the selected count. Explicit selections are validated, sorted and bound into the configuration, approvals, Aqua publication and activation. Saved v1 profiles without a selection retain their original three-token configuration and hashes.

## Checks on 2026-09-13

- SDK/web type checking passed. The [production build](build.log) passed using Next 16.3.4 and Node 22.22.1 in `.next-e2e`, separate from the running Arc profile.
- `packages/sdk/test/strategy-profile.test.ts` passed: sizes 2–8, all presets at 10/100/1,000,000 units, selected-only transaction encoding, invalid selections, and legacy three-token fixture equivalence.
- The [initializer observations](initializer.json) contain 81 successful read-only calls at the recorded Arc block: all three current pairs plus one basket at each size 3–8, with three presets and three allocations. SDK coordinates, principal and virtual reserves matched the deployed initializer exactly. Tokens beyond the current three were synthetic pure-function inputs, not newly supported assets or published strategies.
- The [independent calculation](audit/independent.json) passed at 110 and 160 Decimal digits. It independently computes quantized reference keys, threshold roots, cap minima and raw ceilings, and checks `ideal principal <= rounded principal <= allocation`. The bounded-run [manifest](audit/manifest.json) pins input/output hashes, versions and limits; the installed computation-audit validator accepted it. This is finite numerical evidence, not a proof of universal solver liveness or all allocations/trade trajectories.
- The [local EVM lifecycle test](contract.log) passed nine configurations: every two-token subset of the existing three-token fixture under Wide/Balanced/Focused. Each was published, activated, quoted and traded in both directions, retired and docked. Checks cover quote/settlement agreement, fee receipts, selected-only availability and unchanged omitted-token inventory. The reported gas is the aggregate test loop, not a single user transaction.
- All six [browser checks](browser.log) passed. They cover selection/removal with mouse and keyboard, at least-two gating, live pair counts and allocations, an eight-token manifest, responsive widths 1440/390/320, no overflow, selected-pair preparation and reload, legacy draft recovery, and both risk acknowledgements. Browser publication preparation used the existing synthetic wallet/RPC fixture and submitted no transactions.
- The [broader SDK run](sdk.log) passed 17 of 20 test files. Three existing tests (`events`, `payment-read-abi`, `swap-events`) expect two Aqua ABI functions, while the unchanged generated ABI already contains `dock`, `rawBalances` and `ship`. Their only failing assertions are this stale count. The generated ABI and these tests match HEAD; this change does not alter them. There is no configured lint runner; the root lint script reports that type checking is the available static check.

## Reproduce

Run from the repository root unless a subshell specifies otherwise:

```sh
(cd packages/sdk && node --import tsx --test test/strategy-profile.test.ts)
forge test --root packages/contracts --match-contract SelectedTokensTest --match-test testSelectedPairsPublishTradeBothDirectionsAndRetire -vv
pnpm --manage-package-manager-versions=false --filter @orbital/sdk typecheck
pnpm --manage-package-manager-versions=false --filter @orbital/web typecheck
(cd apps/web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome node node_modules/@playwright/test/cli.js test liquidity-tokens.spec.ts workflows.spec.ts --grep 'liquidity selection|deployment allowlist|publication preserves|strategy intent')
(cd apps/web && ORBITAL_E2E=1 NEXT_PUBLIC_PRIVY_APP_ID='' node node_modules/next/dist/bin/next build)
```

The read-only initializer script requires the existing compiled initializer artifact, deployment plan and an accessible Arc RPC. Rerunning it replaces the current observation file and invalidates this audit's pinned input hash; preserve historical evidence first. It uses no signer:

```sh
node --import ./packages/sdk/node_modules/tsx/dist/loader.mjs packages/sdk/scripts/selected-profile-smoke.ts
```

The independent oracle can check the recorded observations without an RPC. Write a new result rather than overwriting the pinned audit:

```sh
python3 packages/reference/profile_smoke.py --input test/evidence/selected-token-profiles/initializer.json --output /tmp/selected-token-profile-check.json
```

`claim.json` is the bounded computation contract. The retained audit ran the installed computation-audit runner with a 30-second wall limit, 10-second CPU limit, 512 MiB address-space limit and one core/thread. The manifest records the exact executed command, timestamp and hashes. Its outcome is limited to the stated 81 cases; larger-basket swap execution and a user-signed Arc publication are not claimed by these checks.
