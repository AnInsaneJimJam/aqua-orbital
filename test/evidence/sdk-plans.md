# SDK transaction plans — bounded G5 implementation

Observed locally on 2026-09-08. This evidence covers pure encoding, validation and wallet-port fixtures. It is not a deployed Orbital swap, Arc verification or Privy transaction receipt.

## Implemented boundary

`packages/sdk/src/plans.ts` constructs transactions from a retained user intent, a verified deployment manifest and explicit chain/account context. It binds canonical config/order hashes, allowlisted token decimals, caller/recipient, gross amount, once-on-gross fee, positive reviewed minimum, deadline, quote lifetime and crossing bound. All plans use zero native value. `validateTransactionPlan` reconstructs the complete expected calldata locally and rejects target, selector, recipient, amount, account, network, value, trailing-byte and extra-field changes.

Supported constructors:

- Swap and exact router approval.
- Maker approval at four times initial allocation, optional explicit zero-reset step, direct maker-called Aqua ship and dock. Shipped publication observations suppress duplicate shipping.
- Invoice creation with a predicted ID, exact immutable terms, due/expiry/split constraints, direct USDC payment, swap-funded payment, exact adapter approvals and merchant cancellation. The receipt's `InvoiceCreated` ID remains authoritative if another merchant transaction advances the nonce.

`buildMakerPlan` returns `unavailable: 'activateStrategy'`. `buildRetireAndDockPlan` refuses to construct retirement until the implementation ABI exists; it can return docking after independently observed retirement. The standalone dock action also permits recovering a shipped but inactive strategy. These are local plans, not completed lifecycle orchestration.

The generic `ExecutionPort` remains usable by explicit fixtures. Execution now takes an immutable copy before asynchronous wallet work, checks active account/network before and after estimation, persists the submitted hash before waiting, and refuses a receipt for a different transaction. Receipt recovery does not submit again.

## Source and encoding provenance

Action ABIs are generated from existing Foundry artifacts for pinned `ISwapVM`, official `IAqua`, and `OrbitalPayments`. The generator verifies the defining source's Keccak against compiler metadata and the Solidity 0.8.30, Cancun, optimizer 700, via-IR settings. Source SHA-256 and compiler method identifiers are retained in `packages/sdk/src/generated/provenance.json`. The tests compare those selectors and source hashes. Activation/retirement methods are absent.

`packages/sdk/test/fixtures/canonical.json` retains config encoding/hash, 68-byte program, order encoding/hash and invoice ID independently generated with Foundry `cast` 1.5.1. The fixture generator uses explicit ABI tuple signatures and the maker traits constants already covered by `packages/contracts/test/Codec.t.sol`. Cast parity is encoding evidence; this new fixture does not itself prove an Aqua receipt or full activation parity.

Regeneration, after a current contract build:

```powershell
node packages/sdk/scripts/generate-abi.mjs
node packages/sdk/scripts/generate-goldens.mjs
```

## Verification

| Command / phase | Observed result |
| --- | --- |
| Initial test-first SDK plan run | 18 tests: 11 passed, 7 failed; missing constructors/DTO functions and acceptance of a zero approval account were exposed. The negative-only group was not counted as implementation evidence. |
| Async execution and receipt regressions before fixes | Frozen transaction and mismatched receipt tests failed; implemented immutable snapshot and receipt identity checks. |
| Maker approval validation and exhausted merchant nonce regressions before fixes | 22 tests: 20 passed, 2 failed; implemented explicit maker approval intent and fail-closed nonce exhaustion. |
| `pnpm --filter @orbital/sdk test` | 22 passed, zero failed; includes the original execution/codec tests. |
| `pnpm --filter @orbital/shared test` | 3 passed; malformed decimal values fail `safeParse` without throwing, DTOs round trip exact integers, ambiguous deployment roles and arbitrary quote transaction fields are rejected. |
| `pnpm --filter @orbital/sdk typecheck` | Passed. |
| `pnpm --filter @orbital/shared typecheck` | Passed. |
| `pnpm --filter @orbital/api test` | Existing 3 API tests passed after the shared-schema changes. |

## Required integration work

The SDK cannot authenticate an RPC server, manifest or an invoice snapshot by inspecting a `verified` boolean. Controllers must obtain the manifest from locally trusted deployment artifacts, validate network/runtime identity, obtain immutable invoice terms and activated configuration from the verified contracts, pin observations to one canonical block, check balances/allowances/availability, re-quote after approvals and before review, and refresh on state changes. No quote response supplies transaction targets or spenders. The supplied timestamp must be the current chain timestamp.

The quote DTO records block/hash/version but this pure constructor does not perform RPC canonicality or version reads. The existing fixture execution port is not a Privy verification. Constructors alone do not implement resumable publication UI, receipt-backed API materialization or any missing certified engine, router activation/retirement implementation, live deployment, or sponsor-qualified payment demonstration.
