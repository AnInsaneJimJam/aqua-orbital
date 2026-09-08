# Invoice creation and merchant cancellation

Invoice administration is implemented and the application checks pass. No live
Privy or Arc action is claimed.

| Check | Result |
| --- | --- |
| SDK | 123 passed |
| API with isolated PostgreSQL schemas | 210 passed |
| Shared schemas | 7 passed |
| Complete Chromium/recovery suite | 72 passed |
| Production build / workspace TypeScript | Both pass |

The [completion checkpoint](invoice-admin/completed/checkpoint.json) freezes 749
authored inputs across the final browser, proof, build and type runs. SDK/API/
shared runs are explicitly reused from the [earlier checkpoint](invoice-admin/final/checkpoint.json)
after checking their exact transcript hashes and proving that its only later
source changes are the browser test typing fix and completion runner. No
application, SDK, API or shared implementation changed between those runs.
[Production preview health](invoice-admin/preview.json) checks `/pay`, `/swap`
and 22 referenced assets per page; it makes no wallet or receipt claim.

`/pay` now accepts an exact USDC amount, one to three recipients whose shares
total 100%, an expiry and an optional reference. The SDK validates terms and
reconstructs canonical calldata. A separate review shows the merchant, network,
deadline, every exact split (including the final recipient's remainder), gas
budget and adapter before the explicit wallet confirmation. Creation transfers
no tokens and requires no token approval.

The merchant can review cancellation on an unpaid invoice's detail page. Current
onchain status, ownership and terms are rechecked before signing; a racing
payment prevents cancellation. Expired unpaid invoices may still be cancelled.
A confirmation does not invent a newer indexed status.

## Financial boundary

- `invoice-admin.ts` clones and freezes locally validated drafts/reviews, observes
  one canonical block, checks immutable adapter/router/USDC metadata and token
  precision, and shares the existing exact simulation, fee caps and wallet bridge.
- Creation reads `nextMerchantNonce` from the compiled payment read ABI. The
  reviewed nonce must still match immediately before submission. A concurrent
  transaction after that check can nevertheless change the mined identifier;
  only the exact `InvoiceCreated` receipt event provides the shareable ID.
- Reviews expire twenty seconds after the observed block timestamp. Input,
  wallet, network or deployment changes discard unsigned reviews. A consumed
  review cannot be reused, including after signature or RPC failures.
- Receipt recovery binds the actual canonical transaction to its saved calldata,
  account and adapter. Exactly one matching event must have canonical log bytes,
  block/transaction provenance and the reviewed terms or cancellation ID.
  Missing/mismatched events remain unresolved; no estimated ID becomes a link.
- Public recovery records are stored per chain/account/hash. Their canonical
  action is re-decoded before read-only recovery, and the current verified adapter
  must match. Corrupt storage blocks another signature. Neither plaintext
  reference text nor identity/session information is stored.

The existing presentation template remains. The SDK owns amounts and calldata;
the hook owns orchestration; the wallet module owns RPC/signing; presentation
receives formatted facts and callbacks. A 320px split review was visually
inspected with no horizontal overflow: [screenshot](invoice-admin-review-mobile.png).

## Verification and retained failures

Nine focused SDK checks cover both operations, nonce/status/terms changes,
ownership, expired-invoice cancellation, gas/freshness/identity failures,
single-use reviews, canonical receipt events and authoritative creation IDs.
Fourteen browser workflows plus two recovery-record checks pass in the focused
run: [transcript](invoice-admin/browser-focused.txt). These use synthetic RPC,
historical timestamps and an injected wallet. They do not demonstrate hosted
Privy behavior or real onchain transactions.

Retained preliminary failures:

1. [Missing module](invoice-admin/sdk-red.txt), then an
   [incorrect import](invoice-admin/sdk-import-failure.txt), followed by the
   [nine focused passing checks](invoice-admin/sdk-green.txt).
2. The [initial browser run](invoice-admin/browser-initial.txt) was stopped after
   finding the test fixture used `id` instead of `invoiceId` for cancellation.
   The fixed focused run passes both cancellation cases. [Disposition](invoice-admin/initial-disposition.md).
3. The first full SDK run passed 121/123: the two ABI assertions still expected
   four read getters. They now explicitly include `nextMerchantNonce(address)`
   and its independently observed `cast sig` value `0xaa225a8c`, plus maximum
   uint64 return decoding. [Failed frozen checkpoint](invoice-admin/failed-getter-count/checkpoint.json),
   [exact output](invoice-admin/failed-getter-count/sdk.txt).

4. Production TypeScript rejected the negative storage test assigning `1n` to
   a transaction type that permits only `0n`. The malformed value now enters as
   untrusted JSON. [Failed build](invoice-admin/final/build.txt). All 72 browser
   checks ran again, followed by passing [build](invoice-admin/completed/build.txt)
   and [workspace types](invoice-admin/completed/types.txt). The exact delta and
   unchanged reused inputs are verified by `scripts/finish-invoice-admin.py`.

Reproduce the complete application checkpoint with
`$env:TEST_DATABASE_URL='postgresql://orbital:orbital_local_only@localhost:5432/orbital'`
then `python scripts/audit-invoice-admin.py`. It freezes authored application,
SDK and API inputs and preserves transcripts for SDK/API/shared/browser, proof
generation, production build and workspace types. It refuses to overwrite an
existing final checkpoint. `scripts/finish-invoice-admin.py` records the bounded
completion after the retained test-typing failure; it also refuses overwrites.
Numerical, Solidity release, live Privy, Arc and
performance/accessibility campaigns remain separate.

The existing contract implementation is unchanged. Only its compiled read ABI
gains the already implemented nonce getter. Regenerated source/compiler metadata
stays authenticated; current raw artifact hashes are retained in generated
provenance. No account service, backend signer or Privy-specific contract is added.
