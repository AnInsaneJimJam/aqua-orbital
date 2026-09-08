# Paper-to-implementation ledger

## Source and evidence policy

Source: **Orbital**, Dan Robinson, Ciamac Moallemi, Dave White, June 2, 2025, [official publication](https://www.paradigm.xyz/writing/orbital). Source acquisition, byte hash and extraction metadata belong under `docs/sources/`. HTML must retain mathematical notation; a text extraction with missing equations cannot authenticate a formula.

The paper supplies the mechanism. MATH supplies translated coordinates and explicitly labeled local derivations; NUMERICS supplies additional integer certification obligations. None of those obligations is proved merely because the document requires it. Orbswap (arXiv:2510.05428v1) is comparative context, not the mechanism to implement.

## Traceability

| Mechanism / requirement | Planned implementation | Acceptance / current status |
| --- | --- | --- |
| Sphere, equal-price point, spherical caps | packages/reference/orbital.py; TickGeometry.sol | Analytic reference/geometry unit tests pass; full GEO campaign outstanding |
| Virtual reserves and depeg interpretation | Reference minimizers; coefficient intervals | Analytic virtual/minimum fixtures pass; full depeg/display/budget campaign outstanding |
| Interior sphere / additive boundary consolidation | OrbitalMath.sol endpoint certificate | Explicit per-tick witnesses and accepted mixed-boundary fixture pass; complete allocator outstanding |
| Supporting prices and physical branch | Reference dual/primal checks; endpoint certificate | Aggregate and boundary-price regressions retained; path proof outstanding |
| Fixed-partition swap | Independent per-tick dual oracle | Sphere/consolidation/six-pair fixtures pass; certified production solve outstanding |
| Both roots and inward/outward crossings | Reference frontier_events | Two-root 110/160-digit regression passes; certified traversal outstanding |
| Raw amounts, intervals, conservative payouts | WideMath; TickGeometry; SDK amounts | Wide primitive fuzz/unit and exact parsing pass; combined output/slack bound outstanding |
| Maker-owned Aqua strategy | Router lifecycle/storage | AQ-LIFE/SETTLE/SHARED; adaptation, not paper ownership |
| Once-per-swap maker fee and invoice adapter | Custom fee opcode; OrbitalPayments.sol | Invoice unit tests pass; swap uses test-only router double, custom fee opcode outstanding |

## Open proof obligations

Independently establish convex-set minima, consolidated branch, connected solution uniqueness, all-token supporting-price validity, earliest-event completeness, reconstructed per-tick solvency with bounded rounding slack, and conservative payout. For every result record hypotheses, proof or counterexample, tested ranges, source locator and dependent code/tests.

Use explicit per-tick baskets at >=100 decimal digits for reference fixtures, increase precision, and compare small cases by a separate constrained optimization method. Never use a second copy of the production torus solver as its own oracle. Large-dimensional experiments establish only their recorded bounded range.

## Rounded endpoint audit

Independent audit on 2026-09-08 refutes unconditional positive-price preservation by output flooring. Conditional cap-membership proof: interior reconstruction has squared sphere distance `(r_t/R)^2 F` and sum `r_t h`; boundary reconstruction lies on its sphere and cap plane. With valid partition, `F<=R^2`, `rho>=S`, and certified virtual minima, these establish cap membership and nonnegative principal in exact arithmetic.

Aggregate `g>=0` establishes `x_t,i<=r_t` for interior ticks only. A boundary tick additionally requires `u_max <= (1-b/n)/sigma(b)`. Writing `d=n-b`, the bound is `d/[sqrt(n)*sqrt(n-d^2)]`; its derivative in d is positive, hence it decreases with b. Checking the largest boundary key suffices, subject to directed interval certification.

Counterexample: n=3, full-range radius 1, ordinary radius 1 at b=7/4; K=7/4, S=sqrt(69)/12. Unit prices `p=(0,(5+sqrt(7))/8,(5-sqrt(7))/8)` give `X=2(1-p)`. Retain epsilon=10^-6 in the second asset (zero-based coordinate 1). At 100 and 160 digits, F-1 is approximately -1.911436857888e-6 and every aggregate g is positive, but the boundary tick's coordinate 0 exceeds radius by approximately 6.770390713575e-8. The sphere/cap checks still pass. Arbitrarily small positive epsilon has the same local branch defect.

This is an exact-real endpoint construction with bounded numerical evidence, not yet a complete reachable integer/raw-token transaction regression. The guarded engine is not disproved. Remaining obligations include an integer fixture, robust interval implementation, combined slack bound and representative liveness.

## Crossing and slack-path audit

The global M4 quadratic for each ordinary key enumerates every crossing on the exact frontier: `Ac=K+Rb` and `rho_c=S+R sigma(b)` are unchanged by assigning the equality tick to either partition. The two roots are candidates, not evidence of connected traversal. `packages/reference/orbital.py:frontier_events` validates candidates using explicit per-tick support baskets. The two-asset inward/outward regression checks both roots at 110 and 160 digits. This diagnostic does not certify the intervals between events.

A proposed reduction of a rounded starting state to the frontier by lowering only its output coordinate is **not accepted**. The independent audit found that this segment can leave `rho>=S` and reenter, even with valid endpoints, key-plane events and input/output equality. Convexity preserves membership in the sum of reserve sets, but does not preserve this particular reconstruction sheet.

Retained fixture: n=4, full radius R=2, ordinary radius r=10^-6, exactly quantized b=2+2^-31. Set S=r sigma(b), Ac=(R+r)b, k=sqrt(3)/2, c=(Ac+3S/k)/4 and v=3S/4. Untouched coordinates are `(c+v,c-v/2,c-v/2)`. Output falls from `c+2S/k` to the lower root of the radius-(R+r) sphere with those untouched coordinates. The released output is approximately 1.05591053087603e-9 whole tokens, below one six-decimal raw unit. At output c, the cap remains boundary but `rho/S=sqrt(27/32)<1`. Endpoints, selected pair equality and the only key event pass.

`packages/reference/tests/test_slack_path.py` reproduces this strengthened fixture at 110 and 160 digits. It is an exact-real small-slack construction; integer transaction reachability remains unproved. At minimum, a path algorithm must examine the variance minimum (output equals the mean of untouched coordinates), which differs from pair equality. Adding that check has not been proved sufficient. This obligation blocks G1/G2 acceptance; it must not be hidden by mass rejection or by treating the oracle as the production solver.
