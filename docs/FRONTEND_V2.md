# Frontend v2

Implemented on `frontend-v2`, following every Markdown instruction and all eight image references in `FRONTEND-specs/`. The original reference folder remains untouched and excluded from commits. Current work was checkpointed first as `71dd2fe` (`Save current work`).

## Design and implementation

- Black `#050505` canvas; `#101010` / `#161616` surfaces; `#282828` borders; warm white `#F5F5F2` text and primary actions.
- Existing Space Grotesk paired with the real Instrument Serif italic face. The retained cut-circle emblem is recreated as a clean SVG, shared by navigation, favicon, loading, and Privy branding.
- One header across every route: Swap, Liquidity, Payments, Demo Tokens; active underline, Arc Testnet, connected-wallet states, and an accessible mobile menu.
- Centered two-line landing headline, supporting copy, Saturn sculpture, Swap Stablecoin and Docs actions. “How Orbital Swap works” is below the first viewport and scrolls normally.
- A 380-unit stationary dithered planet within a 960×400 canvas; approximately 954-unit ring footprint; 480 equal, upright 11-unit tiles, reduced to 240 on constrained devices. The clockwise orbit repeats every 40 seconds. Rear tiles draw behind the planet; front tiles draw over it. Motion pauses offscreen, in hidden tabs, on user request, and for reduced-motion preferences. A matching SVG supplies the static/no-JavaScript fallback.
- Swap uses open, stacked Sell/Buy panels and compact token capsules. Liquidity uses a broad strategies workspace with right-side creation and owner controls. Payments uses a focused invoice form with recipient and amount panels; optional splits, expiry, and reference remain accessible. Demo Tokens uses a flat asset list.

The mockups’ illustrative tokens and operations were adapted to the actual application: USDC, oUSD6, and oUSD18; wallet-backed strategies and allowances; immutable invoices and direct or swap-funded settlement. Existing APIs, controllers, exact arithmetic, validation, approval sequencing, transaction review, receipt recovery, and faucet limits are unchanged. Protocol evidence remains available from the footer. No illustrative metrics or unsupported assets were introduced.

## Assets and links

- [Approved references](../FRONTEND-specs/README.md) and [master brief](../FRONTEND-specs/ORBITAL_SWAP_MASTER_PROMPT.md) remain in the supplied folder.
- USDC SVG: original from [Circle’s pressroom](https://www.circle.com/pressroom), [USDC brand archive](https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Pressroom/brandkit/logo-downloads/usdc.zip). oUSD6/oUSD18 glyphs are original demo identifiers.
- Instrument Serif italic: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/instrumentserif); the existing `InstrumentSerif-OFL.txt` license is retained.
- Docs uses the repository’s existing canonical GitHub destination: [project documentation](https://github.com/AnInsaneJimJam/aqua-orbital/tree/main/docs).

## Verification — 2026-09-13

| Check | Result |
| --- | --- |
| All frontend browser tests | **90 passed**, including exact approval/swap/payment execution, rejection, network/account changes, invoice administration, strategy observations, storage recovery, and quote freshness |
| Focused Node checks | **8 passed**: Saturn geometry/fallback, payment limits, quote refresh, bounded RPC relay |
| Workspace TypeScript | **Passed** |
| Optimized Next.js production build | **Passed**, all routes generated |
| Final production browser smoke | **8 passed**, including all public layouts and navigation at four viewport widths |
| Existing Arc profile | Web and API responded successfully; all five screens rendered at `http://localhost:3002` in a read-only smoke test |
| Visual/browser comparison | Landing and app routes checked at 1440, 1366, 390, and 320px; desktop/mobile forms, menus, settings, and no horizontal overflow |
| Hero geometry | At 1366×768, primary CTA bottom ≈726px; explanatory heading begins ≈854px. At 390×844, CTA bottom ≈583px; heading begins ≈909px |
| Actual motion | Independently observed a full 40-second cycle; moving tiles, stationary planet pixels, pause/resume, reduced-motion freeze, and offscreen freeze passed |
| Accessibility | Visible Sell/Buy labels also name their controls; keyboard menu/dialog/select focus, touch targets, reduced motion, and transaction announcements preserved |
| Diff checks | Passed; historical evidence screenshots and pre-existing work preserved |
| Lint | **Unavailable before this change**: the repository’s lint gate exits 1 because no dedicated lint configuration exists |

Screenshots from this verification are under `.cache/frontend-v2/screenshots/`; historical evidence is not overwritten. Test fixtures simulate API/RPC/wallet responses and never broadcast transactions. Live Privy sign-in and real Arc financial transactions were not rerun for this visual change.

Reproduce from the repository root:

```bash
pnpm --manage-package-manager-versions=false -r --if-present typecheck
cd apps/web
NEXT_PUBLIC_PRIVY_APP_ID='' ORBITAL_E2E=1 node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
# In another terminal:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome node node_modules/@playwright/test/cli.js test
node --import ../../packages/sdk/node_modules/tsx/dist/loader.mjs checks/saturn-scene.test.ts
node --import ../../packages/sdk/node_modules/tsx/dist/loader.mjs checks/payment-limit.test.ts
node --import ../../packages/sdk/node_modules/tsx/dist/loader.mjs checks/quote-refresh.test.ts
node --import ../../packages/sdk/node_modules/tsx/dist/loader.mjs checks/chain-rpc.test.ts
NEXT_PUBLIC_PRIVY_APP_ID='' ORBITAL_E2E=0 ORBITAL_PROFILE=frontend-v2 node node_modules/next/dist/bin/next build
```

`PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome; omit it when the matching Playwright Chromium is installed. The package-manager flag uses the installed pnpm without attempting a write to its protected version-management directory. Local browser/server checks needed the environment’s approved sandbox escalation.
