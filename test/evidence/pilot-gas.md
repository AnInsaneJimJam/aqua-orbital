# Eight-token pilot gas diagnosis

The three named concentrated cases match their independent raw output,
reserve and transition goldens. **No optimization is promoted.** The retained
batch-discovery candidate exceeded EIP-170; production sources were restored
byte-for-byte to commit `8b6f7ff`. Gas remains a deployment blocker.

| n8/t8 case | Composition body | External call including ABI | Fresh discovery diagnostic |
| --- | ---: | ---: | ---: |
| step1, seven outward events | 13,886,908 | 13,920,418 | 7,029,886 |
| step2, fourteen inward/outward events | 18,020,703 | 18,062,533 | 7,337,657 |
| step3, no events | 17,285,294 | 17,310,531 | 7,286,264 |

These exclude router fees, backing, settlement and transaction intrinsic gas.
Phase calls have fresh memory and differing warm-address costs; they are not
additive production traces. The earlier pilot's diagnostic figures additionally
include metadata and dispatch, so they are not identical metrics. The
[computation contract](pilot-gas/contract.md) defines the selected range,
arithmetic and non-claims. [Baseline manifest](pilot-gas/baseline/manifest.json),
[source/measurement checkpoint](pilot-gas/baseline/checkpoint.json),
[exact transcript](pilot-gas/baseline/forge.txt).

## Rejected candidate

One internal call reused validated input and sequentially advanced tick contexts
instead of repeating `exactInput(..., count, 0)` in fresh linked calls. Root
selection equivalence and invalid-input checks passed eleven tests, including
256 context comparisons over n=2..8/ticks=1..8 with near-full ordinary caps.
That finite corpus does not prove universal implementation equivalence.

The context recurrence retained the original per-tick directed contribution
before GRID lifting. Its algebraic argument is conditional on an unmodified
`prepare` context, the same valid immutable sorted ticks, bounded radii and
no retained alias to an earlier context. The private discovery caller met those
preconditions in the inspected code. This was an author self-review using the
proof-audit checklist, **not an independent audit**. The decisive failed
obligation was the resource requirement: endpoint runtime grew from 22,826 to
25,286 bytes, above 24,576. Measured body savings were only 73,012 / 338,850 /
390,360 gas. The precise cause of the small saving was not established by an
opcode/memory trace and must not be asserted from these phase totals.

Retained evidence: [missing-function red](pilot-gas/discovery-red.txt),
[focused green](pilot-gas/discovery-green.txt),
[candidate measurements](pilot-gas/candidate/checkpoint.json),
[candidate manifest](pilot-gas/candidate/manifest.json),
[rejected production diff](pilot-gas/candidate/rejected-production.patch),
[archived test](pilot-gas/candidate/PrefixDiscovery.t.sol.txt),
[archived phase harness](pilot-gas/candidate/PilotGas.t.sol.txt),
[disposition](pilot-gas/candidate/disposition.json).

The six measurement tests' success is a valid diagnostic observation, not
candidate approval. Neither a failed gas proposal nor this selected family
changes the existing conditional accepted-path argument or closes G1/G8.
Following the owner's updated priority, further tuning is deferred while the
missing application workflows are completed. Before target deployment, return
to full settled transaction gas and the unresolved Arc transaction limit.

## Reproduction

`python scripts/generate-pilot-gas-fixtures.py` checks the generated Solidity
literals against the authenticated 110/160-digit pilot and its generation
inputs. `forge test --root packages/contracts --offline --match-contract
^PilotGasTest$ -vv` executes the current six checks. The frozen runner preserves
each named output directory and refuses to overwrite previous evidence.

The [restored manifest](pilot-gas/restored/manifest.json) and
[checkpoint](pilot-gas/restored/checkpoint.json) bind a fresh run after rejecting
the candidate. Historical run manifests retain their own input hashes; they
are not silently relabeled as measurements of later source graphs.
