# Isolated linked-math design checkpoint

The smallest measured design promotes `FrontierComposition.certify` and the
four original-input `FrontierEndpoint` methods to public pure library calls.
The experiment changes generated copies only; it precedes any production
promotion. See [LINKED_MATH](../../docs/audits/LINKED_MATH.md) for the full API,
memory-copy argument, deployment graph, primary sources and budget limits.

- Single linked Composition fails EIP-170 at **30,363 runtime bytes**.
- Composition plus Endpoint passes: **22,253 / 18,327 runtime bytes**, with
  **2,323 / 6,249 bytes** of headroom. The created quote caller is 2,958 bytes.
- Five complete returned ABI values match the normalized-source-equivalent
  original implementation byte for byte: n2/n3/n8 mixed, two-root traversal,
  and the successful order fallback. The separate runtime-size test passes.
- Cold external n8 gas is **11,588,775**, down from the single-library
  experimental baseline's 16,606,227; n3 is 7,111,574 and fallback 9,753,526.
- Initial/remainder budgets and all returned witnesses match. The fallback
  remains 63 first +62 resumed +35 remaining. No predicate/rounding changes.

The final B run uses the pinned generator and reports **6/6 passing tests**,
216.11ms suite runner time after 51.68s compilation. The earlier A run reports
5 result-equivalence passes and one expected deployment-size failure.
Complete commands, timestamps, compiler overrides, input/generated-source
hashes and link-reference artifacts are in [results.json](math-linkage/results.json).
The independently validated computation manifest is
[manifest.json](math-linkage/manifest.json).

The [generator](math-linkage/measure.py) preserves a historical internal
baseline by normalizing only five named visibilities and requiring the pinned
normalized identity of all 13 math sources. Therefore later public promotion
does not make reproduction ambiguous; any body change requires a new explicit
experiment. Platform line endings are recorded through generated-source hashes.
No byte-identical source-file claim is made; exact result bytes are compared.

Root and backend independently reviewed the proposal, actual generated B
source, array aliasing, shared ledger, pure/delegatecall boundary and measurement
scope without finding a concrete defect. Their verdict is conditional on the
existing mathematical proofs, immutable tick/decimal provenance and verified
immutable deployed links. Public pure output is not a settlement authorization.

This is a finite prototype, not an eight-tick worst-path, full transaction,
default-demo gas, target deployment or supported-range acceptance result.
Cold helper cost includes library encoding/copy/calls but excludes transaction
intrinsic and router/storage/fee/settlement overhead. EIP-150 can require more
top-level gas than measured consumption. Arc's transaction cap remains provisional.
No router or storage wiring, manifest identity, supported range or tolerance
was changed during this checkpoint.
