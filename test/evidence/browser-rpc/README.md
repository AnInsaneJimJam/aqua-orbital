# Browser RPC and wallet connection repair

Observed September 9, 2026 local time; raw artifacts use UTC.

The user's browser reported `ERR_BLOCKED_BY_CLIENT` for Blockdaemon, competing extensions redefining `window.ethereum`, an already-pending MetaMask permission request, extension-added body attributes, and an unsupported Coinbase Smart Wallet chain warning. The earlier successful direct-RPC probes did not reproduce that browser's blocking behavior.

## Changes

- Arc application viem/wagmi reads now use `/api/chain` on the web origin. This Node route loads only the verified deployment manifest's fixed HTTPS RPC, validates a small allowlist of read/simulation methods, passes canonical block pins and exact calldata unchanged, strips incoming headers/cookies and disables caching. There is no signing or broadcast method. Calls target deployed contracts/tokens, with no state overrides; requests/results are bounded to 256 KiB/2 MiB, 8 seconds, 16 simultaneous requests and 600 requests/minute per handler instance. Local Anvil transport and wallet-owned submission remain separate.
- External connection attempts have a synchronous guard. Privy login/connect buttons are disabled while connection/selection is active. Automatic wallet selection attempts once per address/connector identity instead of repeating permission requests on every render after a failure. Explicit selection remains available for recovery.
- Coinbase uses `preference.options: 'eoaOnly'` and the wallet list explicitly includes detected Ethereum wallets, MetaMask, Coinbase Wallet and WalletConnect. This removes the unsupported Smart Wallet choice for Arc while retaining ordinary wallets.
- Only the root body has `suppressHydrationWarning`, for attributes injected by extensions before React starts. Descendant mismatches remain visible. No console methods, listener limits or global Ethereum provider are modified.

## Light verification

- Two Node checks pass: exact canonical simulation and revert response passthrough; rejection of signing/broadcast, wrong targets, state overrides, unverified configuration, oversized input and cross-site/arbitrary-provider requests before upstream access.
- Web typecheck passed after implementation. Existing browser RPC fixtures now also intercept `/api/chain`; the broader fixture suite remains deferred.
- [Fresh Chromium observations](observation.json) deliberately block the Blockdaemon hostname and inject extension-style body attributes before hydration. On both localhost and 127.0.0.1, the funding page returns 200, reads report Arc chain 5042002 and actual balances, and a zero-approval simulation/gas estimate succeeds through the web route. Two synchronous Connect clicks show one login modal. No unexpected console/page errors, hydration warnings or unsupported-Coinbase warning were recorded. The test does not authenticate, connect a real wallet or submit transactions.
- The first browser probe used `faucet()` for its simulation and encountered the real `FaucetCooldown(uint256)` revert: the user had already claimed tokens. The final probe uses a zero-approval simulation so its network check does not depend on faucet eligibility. That simulated approval is never submitted.

Commands:

```powershell
node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test apps/web/checks/chain-rpc.test.ts
pnpm --filter @orbital/web typecheck
node apps/web/checks/browser-network.mjs
```

## User-signed funding

Separate read-only receipt checks confirmed both actual user-submitted faucet transactions, including sender, target, exact faucet calldata, successful status, canonical block and mint log. [Receipts](faucet-receipts.json):

- oUSD6: `0x17448344c976c854d994d29ec274b92ad3ecf42181d2eb4711bea759257a470a` — 1,000 tokens.
- oUSD18: `0x6030ca4719925e2dde1236ce0f74f645a543e19203a1bc35ef895a30bfa17ce0` — 1,000 tokens.

The agent signed and broadcast neither transaction. These receipts do not establish an Orbital swap/invoice or a Privy embedded-wallet flow.

## Remaining browser boundary

Fresh Chromium cannot reproduce the exact set of extensions installed in the user's browser. `contentscript.js` listener/multiplex warnings and MetaMask's provider redefinition originate in that extension environment. Finish/dismiss an outstanding wallet permission request and use a browser profile with only the intended wallet provider enabled. The application cannot clear another extension's pending request or repair its ownership of `window.ethereum`. Ordinary HMR rebuilding logs are development status, not transaction errors. [React's hydration guidance](https://react.dev/reference/react-dom/client/hydrateRoot) documents the shallow suppression boundary.
