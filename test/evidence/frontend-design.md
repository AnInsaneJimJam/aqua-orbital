# Supplied-media frontend redesign — light checkpoint

Recorded September 9, 2026 (Asia/Calcutta). This is presentation and local browser evidence, not G6/G8 acceptance or live sponsor qualification.

## Delivered

The owner-supplied Orbital video and SVG logo now lead the landing page and shared identity. A video-matched deep blue canvas, chartreuse actions, local fonts and diagram framing carry through swap, liquidity, invoices, funding, proof and wallet controls. Source provenance, poster generation and font notices are documented in [ASSETS](../../docs/ASSETS.md); editable boundaries are in [FRONTEND](../../docs/FRONTEND.md).

Simplified optional details and empty pagination without changing SDK code, financial controllers, contracts, signing ports, amount parsing or transaction generation. Exact signing-review amounts, spenders, recipients, networks, gas and deadlines remain visible. Fixed a 320px incomplete-publication button-row overflow found during review. Added a focusable skip target and a more compact swap signing review.

## Verification

- `pnpm --filter @orbital/web build`: **passed**, including TypeScript and all route output. [Final output](frontend-design/build.txt). A separate earlier web type check also passed; the final build includes subsequent presentation edits.
- Chromium at 1440px: landing and the product routes rendered; a local 1 USDC → oUSD6 quote and exact approval review completed without submitting a signature. [Final focused recheck](frontend-design/quote-recheck.json), [review screenshot](frontend-design/swap-review.png).
- At 320px, all nine routes were inspected without horizontal overflow, including a loaded strategy with exact long values; the landing was also checked at 768px and 1440px. [Mobile landing](frontend-design/home-mobile.png), [tablet](frontend-design/home-tablet.png), [loaded strategy](frontend-design/strategy-loaded-mobile.png).
- Reduced motion: poster stays visible, video paused, **zero WebM requests** before explicit playback. Normal autoplay, pause, keyboard play, offscreen pause, onscreen resume and network-error poster fallback all passed. The supplied video has no audio.
- Keyboard: the skip link focuses `main`; the native swap-settings disclosure opens with Enter. Existing wallet dialog rendered with its readable complete address. These are focused checks, not a full accessibility audit.
- [Current source hashes](frontend-design/sources.json) record the frontend source/assets used for this checkpoint. [Desktop landing](frontend-design/home-desktop.png), [payments](frontend-design/payments-desktop.png), [quote](frontend-design/swap-quote.png).

## Retained failures and limits

[Initial review](frontend-design/initial-review.json) caught the mobile incomplete-publication row overflow; its local quote/review had already passed. The row now wraps and the final mobile check passes. [A subsequent navigation pass](frontend-design/interrupted-navigation.json) hit a development-server restart while frontend configuration timestamps changed. It is not counted as a completed pass.

The [visual/media report](frontend-design/visual-and-media.json) records all its visual and media checks passing, then a local quote timeout: the page correctly displayed unavailable funds/quote instead of invented amounts. A later readiness check returned HTTP 200 and the [separate quote recheck](frontend-design/quote-recheck.json) passed. Earlier during the session, the indexer's database connection also dropped under local resource pressure, stopping the owned preview; the normal local runner recovered. Intermittent local RPC/database behavior remains an integration concern, not a new frontend acceptance claim.

No new transaction was signed for this redesign. The local wallet fixture is not Privy qualification. Live Privy wallet execution/reconnection, Arc deployment, broader transaction regressions, cross-browser/accessibility/performance campaigns, mathematical obligations and security release gates remain separate and open.

The ad-hoc [visual driver](frontend-design/visual-driver.txt) and [quote driver](frontend-design/quote-driver.txt) are retained as text for reproduction: copy them into `.cache/` with `.mjs` extensions and run from the repository root against `pnpm dev:local`. They are intentionally not registered as an additional release suite. The visual driver includes the later quote attempt, so its exit code reflects RPC availability as well as presentation checks.
