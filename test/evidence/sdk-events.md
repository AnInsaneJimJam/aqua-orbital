# Generated SDK lifecycle, invoice and swap event ABIs

Observed 2026-09-08. The SDK exports `lifecycleEventsAbi`, `paymentsEventsAbi`
and the additive `swapEventsAbi` from `@orbital/sdk`. The first two retain the
two lifecycle and three invoice events; the third contains only
`OrbitalSwapExecuted`. Existing function ABIs and transaction plans are
unchanged. Current verification is **38 SDK tests passed plus typecheck**;
the original 33-test checkpoint is retained below for provenance.

`packages/sdk/scripts/generate-abi.mjs` selects events from the compiled
`IOrbitalLifecycle` and `OrbitalPayments` artifacts. Lifecycle entries must
also match the concrete `OrbitalSwapVMRouter` artifact, including indexed
flags, argument names/types and anonymity. The generator checks source bytes
against compiler metadata, rejects missing/overloaded selected names, and
requires Solidity `0.8.30+commit.73712a01`, Cancun, enabled optimizer with 700
runs, and via-IR.

Event provenance is stored in
`packages/sdk/src/generated/events-provenance.json`: source SHA256, compiler
configuration, selected ABI SHA256, build artifact SHA256, and exact event
signature/topic hashes. The lifecycle record also identifies the compared
concrete router source/artifact. Existing function provenance remains in its
original `provenance.json` file and format. These attestations describe local
compiled ABI inputs, not a verified deployment or emitted receipt.

## Independent byte fixtures and tests

`scripts/generate-event-goldens.mjs` uses the installed `cast 1.5.1` CLI to
create topic hashes, indexed words and nonindexed data from the Solidity
declarations independently of the generated TypeScript ABI. It uses no RPC.
The resulting `test/fixtures/events.json` covers:

- `StrategyActivated`: three indexed arguments and empty data.
- `StrategyRetired`: maker/order topics and maximum uint64 version data.
- `InvoiceCreated`: invoice/merchant topics, dynamic recipient/share arrays,
  uint40 expiry, bytes32 memo and exact uint256 amount data.
- `InvoicePaid`: invoice/merchant/payer topics, input token, exact input,
  received/refund amounts and route hash.
- `InvoiceCancelled`: two indexed arguments and empty data.

The fixtures are synthetic ABI payloads. Large uint256 values deliberately
test decoding beyond JavaScript's safe integer range; they do not assert that
those amounts pass the contracts' financial-capacity checks. Viem decodes
uint64/uint256 values as bigint and these uint40/uint16 fields as safe numbers.

Tests compare decoded argument names/values, independently encoded topics and
data bytes. They also reject an unknown signature, missing indexed topics and
truncated dynamic data; swapping same-typed indexed fields changes the decoded
meaning and cannot accidentally match the expected record. Address/network
authentication and canonical receipt handling remain the indexer's job.

## Original lifecycle/invoice verification

The initial test-first run had **8 failures**, all due to missing event exports
or provenance. After generation, the focused tests passed **8/8**. The first
full SDK run exposed an existing function-provenance consumer that expected
only function records; event provenance was moved to its own generated file.
No existing test was weakened or removed.

```powershell
node packages/sdk/scripts/generate-abi.mjs
node packages/sdk/scripts/generate-event-goldens.mjs
pnpm --filter @orbital/sdk test
pnpm --filter @orbital/sdk typecheck
```

Original checkpoint results: **33 SDK tests passed, zero failures/skips**, including the
prior 25 tests and eight event tests; typecheck passed. The SDK test runner
reported 5.53 seconds. Re-running both generators produced byte-identical
ABI, function-provenance, event-provenance and event-fixture files. Targeted
`git diff --check` passed; Git only reported the repository's normal future
LF-to-CRLF conversion notice for the barrel file.

Original checkpoint SHA256 values (historical after the additive swap export):

| File | SHA256 |
| --- | --- |
| `src/generated/abi.ts` | `8aca5502473e234ceba8b25a302db656b756c7de22ebb26215d81bd465f7cebc` |
| `src/generated/provenance.json` | `6f0acf8b104b13403b9ede931aa83dd51c317640cb613c0f7f8ace72d551f7de` |
| `src/generated/events-provenance.json` | `5000a629fabecac0b071b240ef81a425d58b017c025d8ff05aa41afcf8a9e837` |
| `test/fixtures/events.json` | `d8b311b1d87d821d7044a5cc95c56c56e55f2c82024eee91bca86e4a0b517b58` |

Paths in the table are relative to `packages/sdk`. The five canonical topic
hashes and source/artifact hashes are recorded in the generated provenance,
with the exact regeneration command above. No contract, frontend, network,
signing or deployment change was made in this task.

## Additive canonical swap event checkpoint

The generator now additionally selects `IOrbitalLifecycle.OrbitalSwapExecuted`
and requires exact agreement with the compiled concrete router event. Its
separate `swap-events-provenance.json` contains one record; existing function
and lifecycle/invoice provenance retain their four and two record counts.
Source and artifact hashes were refreshed after the root's router integration.
No pre-existing function or lifecycle/invoice event entry changed.

`test/fixtures/swap-events.json` is generated independently with cast from the
Solidity declaration. It contains the interior path's empty crossing arrays
and a synthetic full-width payload with repeated ordered uint64 keys and
`[true,false,true]` directions. Maximum uint256 gross and uint64 version values
decode as bigint; pair indices decode as safe numbers. The full-width keys and
amounts test ABI representation only and are not admissible production trades.
In particular, synthetic crossing arrays do not claim that mixed traversal is
implemented or that any such event has been emitted on a live network.

Five new tests first failed for missing export/provenance. The completed run
passed **38/38 SDK tests**, including all five additions, in 14.81 seconds;
`pnpm --filter @orbital/sdk typecheck` passed. The new tests check indexed
maker/order/taker placement, all nonindexed words, bigint fidelity, empty and
ordered crossing arrays, malformed topics/truncated dynamic data, current
source/compiler provenance and unchanged pre-existing ABI groups. Both
generators then reproduced all six generated ABI/provenance/fixture files
byte-for-byte.

Current SHA256 values, relative to `packages/sdk`:

| File | SHA256 |
| --- | --- |
| `src/generated/abi.ts` | `d86d581b1225583bf5c4b70c62b7686e633eb316f94384bc8a80dde90e21db5d` |
| `src/generated/provenance.json` | `44faac3ef91e35dbe809467e6d8ff94acdd771946d797d537e56525d33ca4bce` |
| `src/generated/events-provenance.json` | `b78b000512400b353a8509a1685510f1ee6a092214042c05381fcfb32ec0055d` |
| `src/generated/swap-events-provenance.json` | `66a75e9916c484d7385d8f168ccd59da1a3171fe4e1f7596041cd6d220070e14` |
| `test/fixtures/events.json` | `d8b311b1d87d821d7044a5cc95c56c56e55f2c82024eee91bca86e4a0b517b58` |
| `test/fixtures/swap-events.json` | `e5b72329f9303cd3df4ca86468c9e7faf836ff4d0c1e7cc30758d55c56c821e7` |

Decoding authenticates ABI shape only. Verified emitter/network identity,
receipt finality, reorg handling and semantic financial materialization remain
separate indexer responsibilities; no indexer financial state was added here.
