# First Arc strategy publication

Observed September 9, 2026 (local time). [Raw observations and receipt](first-strategy.json), [read-only reproduction script](observe-first-strategy.mjs).

Maker `0x5eBA55e1b43c8714E4432250Dada7A518780C871` activated strategy `0xc64a158e90a2b3f9bd211748fe96f1cd59b7f785c18c093b99d033f6ff589eee`. The [activation transaction](https://testnet.arcscan.app/tx/0x93fe7e8e901e8b12939bd5c3af3f0ec59b30368f1e926999f7f0c2b540f542cb) succeeded in block 61,144,147. The probe matched chain ID, sender, router target, full decoded configuration, canonical block membership and the indexed activation event.

The strategy detail API returned active version 1, three tokens and three ticks, initial allocations **10 USDC + 10 oUSD6 + 10 oUSD18**, and a **0.05%** input fee. Live getters reported all three allocations live/backed with positive output funding ceilings. Tokens remain in the maker wallet as Aqua backing.

One actual API quote from the deployed router returned **0.998491 oUSD6 for 1 USDC**, minimum **0.997492 oUSD6** at 0.1% slippage, input fee **0.0005 USDC**. One candidate was inspected, eligible and quoted.

The caller ending `bEEF` is an explicitly synthetic non-maker `eth_call` role, not the user's selected wallet or an authenticated/funded Privy wallet. No signature, approval, submission or token transfer was performed by this probe. The saved quote has expired and must be refreshed before review. API `financialExecutionEnabled:false` identifies a read-only observation, not a failed quote or execution authorization.

First Arc strategy publication is complete. Actual trader swap and swap-funded invoice receipts, their Privy wallet association, and broader mathematical/release campaigns remain open. Earlier empty-route observations remain historical.
