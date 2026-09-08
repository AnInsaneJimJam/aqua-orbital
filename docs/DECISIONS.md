# Material decisions

| Date / ID | Decision | Reason |
| --- | --- | --- |
| 2026-09-08 D01 | Orbital remains the main product; target Privy Best financial flow | Real swaps/payment fit without adding a separate onboarding or organization product |
| 2026-09-08 D02 | Privy user-controlled embedded wallets are allowed; app-held keys and server signing remain excluded | Reconciles the prior blanket hosted-key/account-service wording with integrated user signing |
| 2026-09-08 D03 | Keep strict financial behavior; make visual prescriptions editable | Math correctness and minimal usable frontend are equally necessary; redesign should not rewrite transaction logic |
| 2026-09-08 D04 | Compact optional Saturn illustration replaces mandatory long pinned scene | Financial actions stay immediately reachable and motion remains a replaceable presentation detail |
| 2026-09-08 D05 | Retain Aqua maker ownership and pinned custom SwapVM architecture | Do not accidentally restore the superseded pooled-custody specification |
| 2026-09-08 D06 | Documentation first, then G0–G8 implementation | Accepted user plan; progress and evidence must reflect actual work |
| 2026-09-08 D07 | Certify boundary tick positive-price bounds after rounding | Independent audit found aggregate price signs alone insufficient; NUM-13 strengthened without changing the invariant |
| 2026-09-08 D08 | Reject the proposed endpoint-only vertical slack-release shortcut | A retained small-slack example leaves/reenters rho>=S between checked events; full connected-branch semantics remain open |
| 2026-09-08 D09 | Separate browser fixture profile from live Privy configuration | Normal preview uses the owner-supplied app ID; isolated tests cannot silently become hosted-wallet qualification evidence |

Routine CSS edits need no decision entry. Changes to economics, supported ranges, source pins, key control, or source-derived mathematical assumptions do. Retain superseded decisions with links to replacements.
