# Lower-sheet discovery proposal

2026-09-08. This is a repository numerical implementation choice, not a new
paper theorem or a trade certificate. It addresses a specific failure of an
upper seed to satisfy the existing radial-sheet domain.

## Claim and exact domain

Let `2 <= n <= 8`, `m=n-1`, and let each coordinate of an integer vector be in
`[0,2^192)`. Choose an output coordinate `z`; keep all others fixed. Let
`0 <= sigmaHi < 2^192` and let `lower` be a nonnegative lower proposal limit.
Define `T=sum(untouched)`, `B=sum(untouched^2)`, and
`rho^2=sum_i (X_i-mean(X))^2` in these GRID-denominator coordinates.

**Arithmetic claim:** when `LowerSheetProposal.cap` returns `true,z'`, it leaves
the input vector unchanged, `lower <= z' <= z`, and replacing only the output
coordinate by `z'` gives `rho >= sigmaHi`. False establishes no infeasibility.
There is no claim of cap membership, positive prices, principal solvency,
root identity, optimal output, connected traversal, or complete seed discovery.

## Derivation and rounding

Expanding the variance in the selected coordinate gives

`n*rho^2 = m*z^2 - 2*T*z + n*B - T^2`.

Set `V=m*B-T^2`. The identity
`V=sum_{i<j, untouched}(X_i-X_j)^2` proves `V>=0` exactly, including `m=1`.
If `m*sigmaHi^2 <= V`, the implementation declines to propose: no open
excluded sheet interval is established by this upper sigma bound. Otherwise
put `D=n*(m*sigmaHi^2-V)>0`. Completing the square yields

`n*(rho^2-sigmaHi^2) = ((m*z-T)^2-D)/m`.

The lower endpoint of the excluded open interval is
`z_minus=(T-sqrt(D))/m`. Compute `delta=ceil(sqrt(D))`. If `T<delta`, decline
the proposal. Otherwise choose `c=floor((T-delta)/m)` and `z'=min(z,c)`.
Then `z'<=c<=z_minus`, so `m*z'-T<=-sqrt(D)` and the displayed identity gives
`rho^2>=sigmaHi^2`. Both lengths are nonnegative, hence `rho>=sigmaHi`.
Return true only if `z'>=lower`; no lower limit is crossed. All arithmetic
involving squared moments is exact; the square root rounds upward and the
coordinate quotient downward. The input array is not written.

For `n=2`, `V=0,m=1`, and the expression reduces to
`T-ceil(sqrt(2*sigmaHi^2))`, the earlier two-token high clipping formula.
The integration preserves that existing two-token branch unchanged.

## Width and boundary audit

`T<7*2^192<2^195`, `B<7*2^384<2^387`, and both `m*B` and `T^2` are below
`2^390`. The nonnegative subtraction forming V follows the pair-difference
identity, not an unsigned-underflow assumption. `m*sigmaHi^2<2^387`, so
`D<2^390` and `ceil(sqrt(D))<=2^195`; all wide products fit Uint512 and all
remaining sums, differences, quotients and the root fit uint256. Zero sigma,
no established gap, a negative rounded lower-side ceiling, or a proposal below
the caller's lower limit returns false. Equality at a valid lower-side edge is
allowed as a proposal and is still checked by the caller's directed predicates.

The helper validates dimension, output index and coordinate bounds through
`CurveEvaluation.prepareVertical`; sigma has its own explicit bound. The
caller has already validated immutable ticks, token units and the actual start.

## Integration obligations

`FrontierEndpoint._identify` retains its original cap-sum limits and original
two-token clipping. Only for `n>2`, when the first evaluation reports
`BelowSheet` or `UncertainSheet`, it makes this one arithmetic proposal and
evaluates the new point. `certifiesMembership` and strict output price remain
mandatory. No scalar sign or uncertain result is used to declare an interval
infeasible, choose a crossing, or skip an event.

The original strong-convexity lower seed follows only after that membership
check. `RootBracket` still rechecks both endpoints, the full vertical domain,
the original-radical signs and critical points before identifying/refining a
root. The complete caller still checks initial GRID release, both-root event
order, connected arcs, final raw payout and retained seams. In particular,
finding a root on the lower sheet does not connect a starting point across a
variance hole: the separate path checks must establish the connection.

This adds one bounded algebraic proposal and at most one additional full scalar
evaluation per eligible discovery attempt. It adds no iterative search and
does not reset or enlarge the shared 160 scalar-refinement or 16-crossing
ledgers. It may still defer a feasible case. Gas and runtime size must be
measured on the linked implementation; these arithmetic bounds do not imply
target gas acceptance.

## Dependency and evidence boundary

| Obligation | Kind / current evidence |
| --- | --- |
| Variance expansion, pair-difference identity and lower-root inequality | Exact derivation above; independent pair-difference tests |
| Wide arithmetic and upward integer square root | Existing WideMath proofs/oracles in `test/evidence/wide-performance.md`; new 192-bit and fuzz checks |
| Proposal leaves frame untouched and respects bounds | `LowerSheetProposal.t.sol` hand and fuzz assertions |
| A proposed point is not a root/trade certificate | Existing `CURVE_EVALUATION.md`, `ROOT_CERTIFICATE.md`, `SLACK_SEGMENT.md`, `FRONTIER_COMPOSITION.md`; unchanged final predicates |
| Named practical recovery | Independent `mixed-pilot.json`, configuration `n3-t8-moderate`, step2; `PilotReversal.t.sol` |
| General discovery, endpoint equality, economic histories, worst-range gas | Not established by this proposal |

The retained pilot initially matches 127/128 actions. The remaining reversal
has an identified initial root and all eight scheduled events, but no final
root seed. A diagnostic scan of the fixed proposal interval finds its first
four samples below the sheet and its midpoint feasible. This scan diagnoses
the failure; it is not the implemented proposal algorithm. The exact variance
construction restores the independent output of 7,478 zero-decimal units.
An independent proof/source review and affected differential/regression runs
are required before the integration is treated as a verified improvement.
