# Public invoice detail read and recovery

2026-09-08. The current frontend template is retained. This increment adds a
read-only invoice page, not a payment or sponsor-qualification claim.

## Implemented boundary

The shared invoice detail envelope and SDK decoder bind HTTP status, requested
identifier, chain/deployment roles, token metadata, indexing start/coverage,
confirmed observation, status and receipt provenance. Amounts stay decimal
integer strings until `BigInt` conversion; `formatAmount` never passes money
through JavaScript floating-point numbers. The two-recipient fixture due
`70000000000000001` splits to `63000000000000000` and `7000000000000001`,
retaining the exact final remainder.

The controller fetches current deployment configuration and invoice history
as one query operation. Every explicit refresh repeats both reads, including
after a configuration rotation or outage. The decoder rejects inconsistent
deployment observations. Each HTTP request has a 30-second deadline spanning
response headers and JSON body, plus the query's navigation cancellation.
Failed refreshes hide previously cached invoice terms and allow retry.

Presentation receives typed values and callbacks. It shows full recipients,
amounts, network, immutable deadline, indexed status, stale/historical labels,
and creation/payment/cancellation receipt links. Links use the configured
HTTPS explorer plus a validated transaction hash; Anvil has no implied
explorer. The component imports no wallet and constructs no calldata.
Payment remains disabled even when the indexed state is unpaid.

## Verification

- Six decoder tests first failed against the compiling placeholder:
  [initial RED](invoice-detail-sdk-red.txt).
- A separate review reproduced impossible terminal-event provenance at the
  creation event's block-global log index. The [retained RED](invoice-log-order-red.txt)
  now passes after requiring a strictly later log position for terminal events
  within the same block. [Seven decoder tests pass](invoice-detail-sdk-green.txt).
- The first five browser tests failed against the previous details placeholder:
  [browser RED](invoice-browser-red.txt). They then passed with the public view:
  [first GREEN](invoice-browser-green.txt).
- Independent review found deployment-cache refresh and indefinitely stalled
  request failures. Both were reproduced before fixes:
  [recovery RED](invoice-recovery-red.txt).
- [The full browser run](browser.txt) passes **11/11**: seven invoice checks
  plus the existing four navigation/layout/external-wallet regressions. It
  includes rotation, outage/recovery, a stalled invoice read with a simulated
  clock followed by successful retry, canonical 404, malformed data rejection,
  exact amounts, receipt links and the 320px layout.
- Independent integration review decoded seven actual API observations from
  an isolated PostgreSQL schema: direct/swap paid, cancelled, unpaid, canonical
  absence, stale data and advancement during RPC. That source-data fixture
  check is separate from the browser's intercepted HTTP fixtures.
- Workspace TypeScript checks pass: [output](typecheck.txt).
- Subsequent full SDK regression passes 63/63, including the seven invoice
  decoder tests and twelve artifact integrity checks: [output](sdk-green.txt).
- The production Next build with the locally configured public Privy app ID
  passes: [build output](web-build.txt). The preview at port 3002 was rebuilt
  and restarted; no authenticated wallet action was taken.

Commands: `pnpm --filter @orbital/sdk exec tsx --test test/invoice-read.test.ts`,
`pnpm --filter @orbital/web exec playwright test --reporter=line`, and
`pnpm typecheck`. Playwright uses the isolated development profile with Privy
disabled. Fixture addresses, blocks and receipts are deliberately synthetic;
none are presented as live Arc activity or persisted by the application.

## Visual review and limits

Root inspected the generated [320px view](invoice-mobile.png) and
[paid desktop view](invoice-paid-desktop.png). The very large main amount's
responsive font was adjusted to keep its numeric value together at 320px;
the template, palette, controls and editable CSS tokens remain in place.
Long recipient addresses and hashes wrap without horizontal overflow.

These checks do not establish live Privy behavior, a financial transaction,
200% zoom, non-Chromium browser support, complete accessibility, production
latency or the final product design. Invoice listing UI and payment controllers
remain separate work. Backend canonical history and API evidence are in
[invoice-reads.md](invoice-reads.md); no math definitions are duplicated here.
The [post-run source/output snapshot](invoice-detail-ui-sources.json) records
file identity separately from the test and build claims above.
