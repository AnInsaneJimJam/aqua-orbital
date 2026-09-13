# SDK artifact source integrity

Verified locally on 2026-09-08 with Node 22.18.0. This increment checks the
consistency of existing, unlinked Foundry artifacts with the local sources
declared by their compiler metadata. It performs no compilation, deployment,
RPC request, signing, or change to the public financial interfaces.

## Problem and implementation

The previous ABI generator checked only the requested contract/interface source
hash. An unchanged interface could therefore export an ABI from a build whose
imported Solidity source had changed. The retained synthetic fixture changes
`node_modules/core/Leaf.sol` while leaving `src/Widget.sol` and the artifact
unchanged; the old check accepted it.

`packages/sdk/scripts/artifact-integrity.mjs` now checks every entry in
`rawMetadata.sources` against the bytes reached through that exact local source
name. Missing files, malformed source records and hash mismatches have distinct
errors containing the source identity. Source names reject absolute paths,
Windows drive/UNC/alternate-stream syntax, backslashes, and empty/dot/parent
segments. Normal package-manager symlinks remain supported; remote metadata
URLs are never fetched.

The helper also binds the singleton compilation target to the requested fully
qualified source and contract, pins Solidity 0.8.30+commit.73712a01, Cancun,
optimizer 700, viaIR, IPFS metadata settings and all seven effective remappings.
Unexpected settings, including optimizer details and prelinked library
addresses, fail. The generator currently consumes unlinked builds only.

Creation and runtime references must identify an authenticated source and a
valid library name. Each reference is a nonoverlapping, bounded 20-byte span
containing the expected fully qualified library placeholder; every remaining
byte must be hexadecimal. This also rejects undeclared placeholders. The
placeholder formula follows the [Solidity 0.8.30 linking specification](https://docs.soliditylang.org/en/v0.8.30/using-the-compiler.html#library-linking).
The metadata's source and settings fields follow the
[compiler metadata specification](https://docs.soliditylang.org/en/v0.8.30/metadata.html).

The consumed ABI must agree with the metadata ABI, permitting only object-key
and top-level entry ordering differences. Tuple/argument order, mutability,
internal types and indexed fields remain exact. Method identifiers are
recomputed from the canonical function signatures, including nested tuples.

The generator authenticates every requested artifact before writing outputs.
Repeated reads of a target also reject changes to its artifact bytes during
generation. `src/generated/artifact-integrity.json` records sorted source hashes,
closure hashes, compiler settings, link identities and artifact/metadata hashes
for each distinct build target. It contains no deployment verification flag.
Existing ABI exports and provenance groups are preserved.

## Verification

- [Initial RED](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/artifact-integrity-red.txt): 10 failures against the extracted
  previous direct-source check, including accepted stale/missing dependencies.
- [ABI/selector RED](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/artifact-integrity-abi-red.txt): the first 10 tests passed,
  while altered ABI fields and altered method identifiers remained accepted.
- [Focused GREEN](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/artifact-integrity-green.txt): all 12 tests passed after the
  corresponding implementation changes.
- [Full SDK TAP](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ab70abc0b313aaed0b665d2e3d0a8a87705d291/test/evidence/artifact-integrity-sdk.txt): **63 passed, zero failures/skips**,
  including event goldens, invoice reads, plans and execution regressions.
- SDK TypeScript check and scoped whitespace check passed.
- Generation succeeded against all six current build targets. Repeating
  generation produced identical generated files. No Forge command was run.

| Target | Declared source count | Creation/runtime link spans |
|---|---:|---:|
| IOrbitalLifecycle | 9 | 0 / 0 |
| OrbitalDemoDollar | 6 | 0 / 0 |
| OrbitalPayments | 17 | 0 / 0 |
| OrbitalSwapVMRouter | 63 | 10 / 10 |
| IAqua | 1 | 0 / 0 |
| ISwapVM | 6 | 0 / 0 |

The exported `abi.ts` SHA-256 was unchanged before and after generation:
`491aaf2ab09811bfb1f83d6c0f037b8b4325b05bedfd57be26191b57e3b67a32`.

Reproduction from the repository root:

```powershell
node packages/sdk/node_modules/tsx/dist/cli.mjs --test packages/sdk/test/artifact-integrity.test.ts
node packages/sdk/scripts/generate-abi.mjs
node packages/sdk/node_modules/tsx/dist/cli.mjs --test packages/sdk/test/*.test.ts
node packages/sdk/node_modules/typescript/bin/tsc --noEmit -p packages/sdk/tsconfig.json
```

The backend agent independently reviewed the settings, source resolution and
link-reference checks and found no concrete defect in that scope. Its review
identified the adjacent ABI/selector consistency checks, which were added with
the separate retained RED run above. The reviewer made no source changes.

## Source checkpoint and limits

| File | SHA-256 |
|---|---|
| `packages/sdk/scripts/generate-abi.mjs` | `244ce7ad4d33091b6462ead13596d6bdc64c3d6af346b0af6ba30766a55198b7` |
| `packages/sdk/scripts/artifact-integrity.mjs` | `08f9df71b5b140a8990e676512a551d02a4a9a065ccbe458246d2cf2790c37bb` |
| `packages/sdk/test/artifact-integrity.test.ts` | `9317195bdd34ebfa6aa91988c91671bddcc8b857203837a23d1a9b9e5b1e15eb` |
| `packages/sdk/src/generated/artifact-integrity.json` | `3e607098b60c964c4a526aab767788665d4fbde6f9df4c19d6ab3ba969ab5926` |

The fixture is synthetic compiler-shaped data, not proof that its tiny source
program compiles to the placeholder bytecode. Current real artifacts separately
passed generation. This check trusts the compiler's declared import graph; it
does not independently compile sources or authenticate a compiler binary.
Coherently forged metadata and artifact fields are outside its claim.

Build inputs must be held stable during generation. File reads and multi-file
output writes are not an atomic filesystem snapshot or publishing transaction.
Onchain runtime hashes, actual library addresses, constructor immutables,
canonical deployment receipts, EIP-170 sizing, gas/liveness and authorized
signers remain requirements of the separate deployment pipeline.
