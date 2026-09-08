# Strategy owner actions: implementation checkpoint

The strategy detail route now exposes maker-only approval updates and a reviewed
deactivation sequence. The SDK chooses retirement while an order is active and
docking after retirement; each step requires a fresh review and separate wallet
confirmation. A directly docked active order can still be retired for cleanup.
An already retired/docked order produces an explicit completed-state message.

Approval caps use the existing four-times-initial-allocation builder. An existing
insufficient nonzero allowance is first reset in a separate, explicit review;
the user must request another review to set the cap. The UI explains that this
temporarily affects other strategies sharing the same Aqua allowance. Retirement
is terminal, docking transfers no tokens, and approval changes cannot alter radii.

`strategy-admin.ts` checks the maker, deployment, immutable config/order, current
status/version, complete Aqua entries, canonical block, review age, simulation and
gas budget. It consumes each review once. The frontend uses the existing shared
wallet transport; public pending records preserve exact calldata and intent under
wallet/chain/hash keys. Reload recovery reads a receipt without signing again.
Successful receipts must bind the submitted transaction and the expected
`Approval`, `StrategyRetired` or `Docked` event. The generated Aqua event ABI is
retained with [source provenance](../../packages/sdk/src/generated/aqua-events-provenance.json).

Following the owner's request for light verification, only a focused SDK smoke,
web typecheck and production build were run for this increment:

- [SDK smoke](strategy-admin/sdk-smoke.txt): three synthetic actions, each reviewed,
  submitted once, saved and decoded. It is not a wallet, RPC or contract test.
- [Production build](strategy-admin/build.txt): passed, including frontend TypeScript.
- [Source/check summary](strategy-admin/verification.json): current file hashes and
  the distinction between implemented code and deferred integration verification.

The first web typecheck exposed viem's topic type, which can include filter arrays;
the receipt decoder now accepts that static union and explicitly rejects nonstring
topics when checking a concrete event. The first smoke invocation ran outside the
SDK's ESM package and failed before executing any action. Its
[transcript](strategy-admin/smoke-module-failure.txt) is retained; moving the script
into `packages/sdk/scripts` fixed module resolution without application changes.

No full regression campaign or new browser transaction test is claimed. The
existing mathematical/release gaps and absence of a persistent application
deployment remain. Live Privy/Arc execution, full browser recovery and shared-wallet
regressions remain deferred verification. Publication and replacement are separate
remaining workflows; this checkpoint must not be presented as complete liquidity
onboarding or G6 acceptance.
