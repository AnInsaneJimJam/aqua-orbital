# Basic wallet receipt association — 2026-09-09

**Retained receipt matching passed; Privy wallet association remains unverified.** This is an offline check of existing evidence, with no wallet action or fresh RPC request.

[Machine-readable result](result.json) records **53 passing checks** and SHA-256 hashes for every input. The checker reconstructs each signed transaction and verifies its transaction hash and recovered sender, re-decodes the raw contract events, and matches transaction/receipt/log identities against the retained canonical block observations and verified deployment addresses.

Both transactions were signed by `0x954ACE1023Cdb3798F69582bbdDcBAcd878B73A9`, distinct from maker/merchant `0x5eBA55e1b43c8714E4432250Dada7A518780C871`:

| Retained transaction | Verified transfer linkage |
| --- | --- |
| [Swap, block 61147486](https://testnet.arcscan.app/tx/0xc27397b2bb8557175cc1a824e501046eb4c1373fe396f437c7a0b6737c488e56) | 1 USDC through the router to the maker; 0.998491 oUSD6 to the signer. |
| [Invoice payment, block 61149658](https://testnet.arcscan.app/tx/0xb785144b6eb1ed84de359553602c8a3b6e429a6303f3312294f5961576b01877) | 0.5 oUSD6 through the adapter/router; 0.5 USDC to the merchant and 0.000507 USDC refunded to the payer. |

The [Privy login observation](../arc-integration/privy-login.json) explicitly excludes authentication and wallet creation. The [public UI observation](../arc-integration/deployed-ui.json) is also unauthenticated, and the [payment record](../arc-integration/first-payment.json) explicitly leaves wallet kind unverified. A signed transaction identifies an address; it does not identify Privy or another wallet provider. The retained evidence cannot establish embedded-wallet creation, active selection, reconnection, or provider association with these receipts.

Reproduce from the repository root:

```powershell
node scripts/check-privy-association-basic.mjs
```

[Checker](../../../scripts/check-privy-association-basic.mjs). Live canonicality, block/receipt trie inclusion proofs, current contract runtime, and authenticated provider evidence were not checked. The scope is limited to the files listed in `result.json`; missing evidence does not mean the user used an external wallet.
