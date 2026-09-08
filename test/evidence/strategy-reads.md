# Registered strategy catalogue and pinned inspection

2026-09-08. This G5 increment implements read-only registered strategy history
and optional contract observations. It does not complete strategy discovery from
Aqua shipments, route selection, quoting, or financial execution.

## Interface and evidence boundary

The API serves `GET /api/v1/strategies`,
`GET /api/v1/makers/:address/strategies`, and
`GET /api/v1/strategies/:hash`; existing unprefixed paths are aliases. Responses
use `Cache-Control: no-store`. All responses keep
`financialExecutionEnabled: false`, and every returned strategy keeps
`tradeEligibilityVerified: false`.

List filters are optional maker, a complete distinct allowlisted token pair, and
`all`/`active`/`retired` lifecycle status. Limit defaults to 20 and is at most 50.
Unknown parameters, ambiguous pairs, invalid addresses and oversized or invalid
cursors fail before database/RPC access. A maker path cannot contradict a maker
query filter. Lists return canonical immutable configuration/order, activation
and latest custom-event provenance, lifecycle and version. Their `financial`
field is null; no balances or principal are reconstructed from lifecycle events.

Coverage is explicitly `scope: registered_strategies` and
`unactivatedShipments: false`. Existing Aqua Shipped/Docked raw logs do not yet
have the separate projection needed to list shipped-but-unactivated strategies.
An active lifecycle record is not a claim that its maker can currently fund a
trade. A fully covered absence is HTTP 404, distinct from unavailable deployment,
database, coverage or RPC evidence. Historical/stale data retain those labels.

## Canonical database and pagination policy

`packages/db/src/strategy-reads.ts` opens a read-only repeatable-read transaction.
It requires the configured immutable deployment identity, aligned raw and
deployment cursors, an indexing state, and a canonical current marker with both
lifecycle and swap projection versions equal to 1. Every canonical block from
deployment start through the selected pin must have both coverage markers.

Counts establish a bijection between recognized raw router activation, swap and
retirement events and versioned strategy snapshots. Each snapshot binds its
emitter/topic/payload and unique receipt identity, its immutable activation
configuration, and, for swaps, the distinct custom swap receipt's version, pair,
amounts, fee and crossing arrays. Detached or omitted projections cannot produce
a complete result. This uses the existing versioned swap snapshots; it does not
pretend lifecycle-only snapshots retain the latest swap version.

Rows use the latest state at or below the original pin, ordered by last custom
event block/log position and order hash. A cursor contains a bounded canonical
encoding of deployment, filters, original height/hash and last row position.
That position must still exist in the same pinned filtered set. Ordinary tip
advancement preserves pagination; an orphaned pin returns 409. Current resync,
identity or marker failures still block a historical page. No current-head pin
is substituted into a continuation cursor.

The controller reads the database, checks RPC, and reads the same pinned
database scope again. The final comparison covers pinned identity, coverage,
rows and pagination facts, while allowing normal current-tip advancement.
Amounts and fee sums are decimal integer strings. Cumulative fees checked
against the contract are uint256-bounded because these are per-strategy stored
fee counters, unlike unconstrained aggregate metrics across strategies.

## Contract observation checks

Detail requests for an existing registered strategy make three base RPC reads
(chain, head, exact numbered header) and three getter calls. The latter use the
compiled lifecycle ABI, the configured router, and one
`{blockHash, requireCanonical: true}` selector, as defined by
[EIP-1898](https://eips.ethereum.org/EIPS/eip-1898). Lists and covered absences
need only the three base reads. The block must have at least two confirmations.
See [strategy-rpc.md](strategy-rpc.md) for exact ABI re-encoding, streaming limits,
transport retry and cancellation evidence.

Only the complete config/state/availability tuple can expose `financial` data.
Validation binds chain, router, maker, config hash, canonical order hash, token
allowlist/decimals, lifecycle and latest receipt version. State checks preserve
integer widths and verify principal `X - V`, aggregate first/second moments,
prefix-shaped tick membership, interior radius and boundary key numerator.
Per-token fee counters equal canonical custom-receipt sums at the pin.

Availability retains raw allocation, token count, maker balance and allowance,
live/backed flags, wide surplus/deficit and immediately fundable output ceiling.
The controller checks the contract's all-token healthy gating and exact scaled
backing formulas. Unhealthy backing, docking or revoked approval can be valid
observations with zero ceilings, rather than being silently hidden. Any missing
or inconsistent getter fails the entire detail with `data: null`.

These are coherence checks on observations from the configured RPC and verified
router identity. They do not independently prove curve geometry, reconstruct
every historical reserve change, prove a swap path, or establish quote eligibility.
The database continues to label its financial-state projection unavailable;
getter observations do not change that materialization capability.

The runtime shares one eight-logical-request budget with readiness, metrics and
invoice readers. A detail reserves six and a list reserves three; failures and
shutdown release capacity. The transport has one eight-second group deadline.
The controller separately bounds each sequential database/RPC/database wait;
this is **not** an eight-second end-to-end request deadline. The production pool
also retains its existing bounded size and connection/query/statement timeouts.

## Tests-first and verification

- `strategies-red.txt`: all 11 initial database/controller tests failed against
  the explicit unavailable implementation. Positive baselines were added to
  negative tests before retaining this RED, avoiding vacuous fail-closed passes.
- `strategies-http-red.txt`: the new HTTP behavior failed with 503 versus 200
  before route wiring.
- `strategies-runtime-red.txt`: the actual configured runtime detail failed
  before production dependency wiring.
- `strategies-focused.txt`: 13 database/controller tests and one HTTP test passed.
  Fixtures use disposable real PostgreSQL schemas, actual compiled event ABIs,
  and exact values above 2^53. They cover activation/two swaps/retirement in one
  block, source omissions, pin-preserving pagination, orphaned pins, reorg during
  RPC, immutable identity, exact getter coherence, stale/error privacy, default
  20/max 50 limits, and repeatable-read consistency across an intervening writer.
- `strategies-runtime.txt`: both actual PostgreSQL/runtime HTTP tests passed.
  A detail issued exactly six reads, including three identical hash pins.
  Concurrent three-call groups were refused while six slots were held, then
  succeeded after those reservations were released.
- `strategy-rpc.md`: the independent transport's 12 focused tests passed,
  including a retained deadline-starvation counterexample and repair.
- `strategies-db.txt`: existing database regression **6/6 passed**.
- `strategies-shared.txt`: existing shared schema regression **3/3 passed**.
- API, database, shared and SDK TypeScript checks passed on the frozen sources.
- `strategy-reads-api81.txt`: this increment's full API regression **81/81 passed**, zero skipped or
  cancelled, TAP duration 219,420.8333 ms. This retains all 53 prior API tests and
  adds 13 strategy database/controller, one HTTP, two runtime and 12 transport
  tests. The command was
  `node apps/api/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/*.test.ts`
  with the documented local `TEST_DATABASE_URL` and `NODE_ENV=test`.

The source and selected test hashes are in
[strategy-reads.sources.json](strategy-reads.sources.json). That file is a dated
local snapshot of the selected files, not a complete import closure or an atomic
filesystem snapshot. Node 22.18.0 and pnpm 10.34.5 were used. PostgreSQL tests use
only the documented disposable local profile and drop their isolated schemas.

The fixture getter values are deliberately synthetic, algebraically coherent
ABI data. They are not receipts from real curve execution and do not count as
Arc deployment, Privy verification, a mathematical oracle, or an integrated
release demonstration. No signer, transaction submission, new migration,
frontend redesign or quote enablement is part of this increment. The 200
candidate/32 eligible routing scan and same-caller static quote remain separate
work.
