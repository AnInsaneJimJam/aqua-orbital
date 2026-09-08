# Shared maker inventory and multiple-maker isolation

Status: deterministic complete sequence and 64-sequence fuzz campaign passed.
This is additional bounded coverage of the frozen all-interior router
and official Aqua, not completion of G3/G8 or verification of the later mixed
router graph. No production source was changed.

## Tested sequence

`packages/contracts/test/SharedInventory.t.sol` deploys standard accounting
ERC-20 fixtures (two 6-decimal and one 18-decimal token, sorted by deployed
address), real official Aqua, and the real router.
Maker A publishes A0 and A1 from one wallet; maker B publishes B0. Fees are
100/500/1000 ppm respectively. Each strategy has the genuine directed equal-point
initializer, radii 100/200/400 whole internal units, and keys 1.5 GRID/1.75 GRID/
sentinel. Maker nonces are independently 2 and 1. Publication moves no tokens.
Initial fixture construction uses production geometry coefficients; independent
initializer/root oracle evidence is separate.

Each complete sequence performs the following mandatory actions, with no
`assume`, discarded proposal, or ignored revert:

1. All six directed trading pairs execute against each of A0, A1 and B0.
2. Quote A0 and A1, then move maker A's output wallet balance to an outside
   address until it holds exactly `outputA0 + outputA1 − 1` raw units. Both
   strategies display that same constrained physical funding ceiling. A0 fills;
   A1's geometry and allocation remain unchanged but its physical ceiling falls
   to `outputA1 − 1`. A1 quote and swap must return exactly
   `InsufficientOutputFunding()`. B0 still fills successfully. Returning only
   the intentionally spent amount restores A1 execution at its unchanged quote.
3. Maker A spends the whole selected output balance. Both A0 and A1 quote/swap
   attempts fail with the exact funding error; B0's quote remains unchanged.
   Return the spent tokens and execute A1 without resetting its curve.
4. Reduce maker A's Aqua allowance to exactly `quotedOutputA1 − 1`. Both A
   strategies report this allowance-limited ceiling; A1 quote/swap fails and B0
   remains quotable. Restore approval and execute A1 at the same quoted output.
5. Maker B cannot retire A0 or dock A's namespace. Full snapshots remain equal
   after both expected errors. Maker A retires and docks A0; no wallet tokens
   move. A0 rejects further quoting. **Both A1 and B0 then successfully trade
   all six pairs again.** Finally their own makers retire and dock them.

Every sequence requires exactly 35 successful swaps, 43 successful static quotes,
four expected funding quote failures and four expected funding swap failures,
all six pairs on all three strategies, and all three strategies retired/docked.
The wrong-maker retirement, wrong-maker docking and retired-order quote errors
are additional explicitly asserted lifecycle checks. Quote and swap errors are
counted separately; expected errors inside a passing sequence are not discarded
fuzz cases.

## Exact conservation and rollback assertions

Each strategy has independent integer ghosts for X, principal, fees, Aqua
allocation, initial rounding surplus, version, configuration hash, lifecycle and
pair mask. Fees are computed independently as `ceil(gross × feePpm / 1,000,000)`
over the bounded fixture inputs. The physical wallet ledger is instead indexed
by **maker**, so both A strategies see exactly the same wallet balance and Aqua
allowance. The test deliberately does not sum advertised allocations and call
them escrowed wallet funds.

After every operation, every strategy and token checks:

```text
allocation × scale = principal + cumulative fee × scale + immutable surplus
funding ceiling = min(principal/scale, allocation, maker wallet, maker allowance)
```

The first identity applies while the allocation remains shipped. Retirement
forces the displayed ceiling to zero. Docking zeroes only the selected
strategy's allocation/live count and produces the corresponding exact backing
deficit in its historical view. A shortage of physical balance or allowance
does not itself rewrite principal or make the logical allocation unbacked.

The test also checks exact state sum and wide sum-of-squares, sphere inequalities,
all-interior mask/radius, zero boundary aggregates, bounded slack, immutable
virtual credit, unchanged config and maker nonce, per-maker/taker/outside token
balances, supply conservation, zero router/Aqua/test custody, and cleared
router-to-Aqua approvals. Every successful swap has exactly one canonical event
with its own maker/order/pair/recipient/gross/net/fee/output/version and no
crossing entries. Unselected strategy state/config hashes must remain identical.

Failed funding calls compare a full snapshot of every strategy state/config,
availability (including its Aqua raw allocation), maker nonces, token balances,
allowances and supply. Both return payloads must equal the exact expected error.
The next B0 call or restored A1 swap also proves recovery of the router's global
guard and settlement snapshot. These funding failures occur at preflight; this
does not claim a post-transfer token failure happened. The separate token
callback/reverted-receipt security campaign covers that case. `recordLogs` is
not used as proof of a reverted transaction receipt's log list.

## Finite domain and source provenance

Gross amounts vary from 0.001 to 0.01 whole units, inclusive, using a bounded
uint32 seed. A uint8 argument selects the pair for the depletion phases. All
six pairs execute in every sequence irrespective of that selected pair. The
sequence contains only 35 successful swaps, at most 15 on a single strategy.
Using the independently checked sphere formula and drift argument in
[the stateful baseline](interior-stateful.md), even assigning all 35 inputs or
outputs to one coordinate gives upward drift at most 0.35 and downward drift
less than 0.700070 whole units. From initial X in (295,296), this stays strictly
inside (294,297), as the test asserts; the sum remains below the first seam 1050.
This is a deliberately nonsingular all-interior family, not an unbounded path
or mixed-crossing liveness argument.

`shared-inventory/run.py` uses a byte-copied 87-source closure, with the 86
protocol/upstream files authenticated by `source-pins.json` and retained in
`source-snapshot.tar.gz`. Only this new test may be refreshed from the working
tree during harness development. Each run records the actual test hash and
verifies the full copied file set and input hashes before/after execution.
The archive is restored through exact authenticated members rather than
`extractall`. All source/output/cache paths stay under the isolated
`.cache/shared-inventory` project. Concurrent main-graph changes cannot affect
this historical baseline. Its relocated source-unit names may change metadata;
no bytecode or live deployment identity is inferred.

Reproduce from the repository root:

```text
python test/evidence/shared-inventory/run.py smoke
python test/evidence/shared-inventory/run.py fuzz
```

Settings: Forge 1.5.1-stable, Solc 0.8.30+commit.73712a01, optimizer 700/viaIR/Cancun,
offline compile, two threads, seed `0x20260908`, 64 fuzz runs with
`fuzz.fail_on_revert=true`. Inherited Foundry/Dapp environment overrides are
removed and effective settings retained. This is an ordinary fuzzed **complete
sequence test**, not an invariant handler depth campaign. The earlier smoke
manifest also records unused invariant defaults; those are not execution counts.
The fixture has cheatcode-based test-harness costs and is not a target-gas or
test-contract deployment benchmark.

## Results and limits

The first deterministic smoke passed 1/1: 35 swaps, 43 successful quotes, 4+4
funding failures, 3 terminal retire/dock operations. It began
`2026-09-08T08:13:25.505358+00:00`; Forge reported 948.77 ms suite runtime after
50.74 s compilation. The pre/post changed-input list is empty. A test-local
variable-shadowing warning was then removed before the fuzz campaign; no
behavior or production code changed. These are new property tests for existing
behavior, not a claimed original behavioral RED/GREEN implementation cycle.

The fuzz test passed all 64 complete sequences in 47.31 seconds, following
47.94 seconds of compilation. All 87 copied source files and the runner inputs
were unchanged across execution. Derived from the fixed per-sequence assertions,
this gives 2,240 successful swaps, 2,752 successful quotes, 256 expected funding
quote failures, 256 expected funding swap failures and 192 retire/dock operations.
Those are executed operations, not independently defined test cases. The final
test and runner hashes and the exact UTC run timestamp are retained in
`shared-inventory/fuzz.json`; full output is in `fuzz.txt`.
`shared-inventory/manifest.json` passed the computation-audit structural
validator; `make_manifest.py` verifies current recorded hashes and the exact
64-run transcript before regenerating it.

Broad multi-maker/strategy combinations,
depleted input funding, invoices, adversarial tokens, mixed traversal, arbitrary
lifecycle interleavings and the full release seed matrix remain separate
obligations. The test demonstrates shared-wallet truth and isolation for this
explicit three-strategy family; it does not make each strategy independently
funded or promise that combined advertised allocations can execute together.
