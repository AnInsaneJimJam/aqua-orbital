# Preliminary swap verification

These observations precede the frozen acceptance checkpoint. They are not its source or timing claims.

- The first focused SDK runs passed six new review tests alongside eight existing payment-review tests, and four new settlement-receipt tests. Initial missing-module failures preceded those implementations; no complete frozen SDK run is inferred from those focused checks.
- The first browser run passed all twelve payment regressions and failed six swap tests because the new mock indexed `params[0]` for RPC methods which omit `params`. The pre-fix fixture and six error contexts are retained here. The fixture now treats the parameter array as optional when identifying call destinations.
- The next run passed six swap checks and failed the additional changed-version assertion: production correctly displayed `Strategy changed. Refresh the quote.`, while the assertion expected `version changed`. The assertion was corrected; no production behavior was weakened.
- `storage-red.txt` records one failed and one passed recovery-data test. `storage-before-fix.ts.txt` retains the implementation that accepted an altered approval target. Saved approval recovery now reconstructs the canonical ERC-20 approval and binds token, router spender and exact gross input. Recovery remains read-only and cannot produce a signing review.
- `focused-browser.txt` is a preliminary run. Presentation changes during this run mean it is not a frozen-source acceptance claim. The final runner must pass unchanged authored inputs across complete SDK/shared/browser/build/type commands.

Synthetic lifecycle getter values in the browser fixture test transaction orchestration only. They are not valid mathematical state witnesses, executed contracts, hosted Privy wallets or mined receipts.
