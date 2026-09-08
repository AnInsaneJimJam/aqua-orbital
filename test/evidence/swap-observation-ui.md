# Swap observation controller and existing template

The swap screen now renders checked public quote observations through the shared
SDK decoder. `useSwap` owns requests, raw amount parsing, exact formatting,
deployment/role validation, cancellation and freshness. `SwapView` receives
display strings and callbacks; it constructs no transactions or spenders. The
existing layout, colors and controls remain in place.

Each explicit request reads the deployment, requests a quote, then rechecks the
deployment before decoding. One 30-second allowance covers all three requests
and their bodies. The query consumes cancellation. Account, chain, wallet kind,
connection state, pair, amount or configured-deployment changes immediately hide
the result and invalidate the command. Returning to an earlier input or account
does not restore the old quote. A failed refresh removes earlier amounts.

Displayed observations expire at the earlier of the index's ten-second freshness
limit and the block's twenty-second quote deadline. Render checks, a timer, focus
and visibility checks enforce expiry. The output, minimum output, gross input,
included trading fee and recipient use exact SDK formatting. Bounded inspection
coverage and alternatives appear in a disclosure. Canonical absence is limited
to the inspected strategies and is distinct from an unavailable response.

These are read-only observations. There is no allowance, gas-estimate, signature,
wallet transaction or receipt claim from this screen. Fresh reads, simulation,
explicit financial review and execution-controller integration remain necessary.

## Verification

Eight new Chromium checks pass in [focused output](swap-observation-green.txt).
The complete suite then passes **19/19** in [browser.txt](browser.txt), including
the prior invoice, navigation, 320px layout and external-wallet checks. New tests
cover exact values above JavaScript's safe integer range, malformed limits,
expiry/refresh, account and chain changes, outage/absence, interrupted and stalled
requests, and deployment rotation. The interrupted-response assertion waits for
the obsolete response handler to finish before checking that no amount returns.
The wallet fixture rejects financial methods, and the successful quote test
asserts none were requested.

Tests preceded behavior: the existing screen submitted a request but could not
display the expected output ([RED](swap-observation-red.txt)). Retained setup
diagnostics separately record the JSON import attribute, an earlier missing
button label, paused timers preventing query notifications, re-ranked fixture
hashes after changing its chain, and an ambiguous Next route-announcer locator.
Those fixture repairs did not weaken the production decoder.

Web [type checking](swap-observation-typecheck.txt) and the production
[build](web-build.txt) pass. The rebuilt normal preview returns HTTP 200 at
`http://127.0.0.1:3002/swap`. Both [320px](invoice-admin/previous/swap-observation-mobile.png) and
[desktop](invoice-admin/previous/swap-observation-desktop.png) screenshots were inspected. These capture
development HTTP/wallet fixtures; the normal preview has no verified live
deployment or authentic Privy financial receipt.

The backend agent independently reviewed the controller's cancellation, context
binding, manifest rotation and expiry handling without finding a concrete defect
within this read-only scope. This is not a full accessibility, browser matrix or
production performance campaign. [Selected source/output hashes](swap-observation-ui.sources.json)
identify this checkpoint and are not a complete browser bundle attestation.
