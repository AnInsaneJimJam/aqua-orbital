# N2 outward high-sheet seed proposal and production promotion

Status: isolated tests-first experiment followed by the separately authorized
narrow production promotion below. This is a repository-derived bracket
proposal and conditional arithmetic proof. It
does not establish supported-range discovery, a new root theorem, deployment
gas headroom, or a reachable raw-token history.

## Retained failure and proposed change

The independent supporting-basket `seed_deferral` case in
[`fixtures_payout_resume.py`](../../packages/reference/fixtures_payout_resume.py)
has `n=2`, two radii `10^40`, ordinary key `5*GRID/8`, input/output `0/1`,
decimals `18/18`, and raw net input `381100078699772177738`.
Its initial actual reserves are
`[2527133520585472095299795479050357292168,
10306468614415789726245162508561985295187]`.

The old `_identify` upper key-plane proposal has output GRID coordinate
`28745403767035575587661918325688063669185286242304`.
At that point `rhoHi < sigmaLo`: `CurveEvaluation` returns `BelowSheet`, so
the endpoint never attempts root refinement. This is a feasible geometry
whose discovery was deferred by that proposal; it is not a failure of the root proof.
The original failure remains an explicit passing diagnostic test.

The isolated change, immediately before the existing full high-point
evaluation, applies only when `n == 2`, the proposed prefix has a boundary
tick, and `other > output`. It computes

```text
d = ceil(sqrt(2*sigmaHi^2))
highOutput = min(highOutput, other-d).
```

Unsigned underflow (`other < d`) and an empty existing key/principal window
(`highOutput < lower`) return uncertainty. All original membership, output
price, lower/upper signs, whole-domain critical-point checks, raw payout,
reconstruction, canonical classification and composition checks remain.
No prepared context or new caller certificate is accepted.

## Conditional arithmetic argument

For two coordinates the exact transverse radius is
`rho = abs(other-output)/sqrt(2)`. On the selected outward branch, the proposed
cap gives `(other-output)^2 >= 2*sigmaHi^2`; therefore `rho >= sigmaHi` and,
because `sigmaHi` is an integer GRID length, `floor(rho) >= sigmaHi`.
This proves only that the directed sheet lower bound is satisfied. It does
not prove membership or root identity; the existing evaluations prove those.

An already certified original high point on this branch is unchanged:
its `floor(rho) >= sigmaHi` already implies `other-output >= d`.
The all-interior branch and the opposite ordering are unchanged by the
conditional. Lowering an accepted proposal while retaining `high >= lower`
preserves its existing adjacent key-plane and principal window; the full
domain is still rechecked independently.

`C.prepare` validates total radius below `2^160`; directed transverse
contributions are at most their radii. Thus its `sigmaHi` is below `2^192`
after lifting by GRID. The doubled square is below `2^385`, within the
512-bit primitive, and its rounded square root fits well inside 256 bits.
Subtraction is guarded. The proposal adds fixed arithmetic work and consumes
no midpoint evaluations. Composition still accounts for the same shared
160-evaluation ledger and crossing allowance.

For this fixture the proposed high is
`26843545600000000000045871803013165693130594979710`.
The test checks full membership, strict output price and a certified ordinary
root bracket with zero midpoint budget. Full ordinary and payout-targeted
endpoint calls, followed by full composition, independently retain:

| Quantity | Integer value |
| --- | --- |
| Raw output | `399184686675480708007` |
| Ideal final root floor, GRID | `12639276407035575587679706336065267487035352665727` |
| Ideal shortfall ceiling, internal | `11709071672542645455` |
| Initial / final ideal prefix | `1 / 1` |
| Frontier transitions | inward, then outward, at the same ordinary key |

The golden values come from the existing separate 110/160-digit explicit
supporting-basket reference; production coefficients are used only in the
implementation diagnostics. The independent reference's historical
`seed_deferral` label is deliberately unchanged; its commentary and literal
binding now distinguish the recovered production behavior from the old seed.

## Observed tests and reproduction

The new [test template](seed-proposal/SeedProposal.t.sol.in) and
[runner](seed-proposal/run.py) use a separate source/output/cache graph under
`.cache/seed-discovery`. No production file was edited. The first invocation
retains the exact 13-library source closure and its fixture in that local
cache; RED and GREEN reuse that snapshot while main source visibility changes
can proceed independently. [RED](seed-proposal/red.json) and
[GREEN](seed-proposal/green.json) record every original and generated source
hash, template/runner hashes, commands, timestamps and transcript hashes.
The cached baseline is necessary for exact replay of these original hashes;
starting from later production sources is a new experiment, not replay.

```powershell
python test/evidence/seed-proposal/run.py red
python test/evidence/seed-proposal/run.py green
```

RED started `2026-09-08T06:42:58.005350+00:00`: **3 passed, 5 failed** against
the unused arithmetic stub and unchanged endpoint. The original failure,
existing inward golden and all-interior regression passed. The new clipping,
endpoint and composition expectations failed. The transcript and JSON were
saved before a Windows console encoding error while printing the fuzz symbol;
only output printing was corrected before GREEN.

GREEN started `2026-09-08T06:44:34.517580+00:00`: **8 passed, 0 failed**, Solc
0.8.30, compile 35.50 seconds, suite 127.41 ms. The runner took 41.67 seconds.
The configured fuzz count was 256 with seed `0x20260908`; Forge reported **257
runs**, including replay of the retained stub-failure input. The fuzz test
checks exact directed square inequalities; direct tests also reject
underflow and empty windows. Full endpoint tests bind the independent golden;
composition additionally checks both transitions, the shared ledger and the
actual final reconstruction.

These isolated gas figures include test work. They are not linked
production-router transaction estimates. General `n>2` seed discovery is deferred.

## Production promotion after the visibility-only handoff

After the independent root review and the linked-library owner's explicit
handoff, the new main [SeedProposal test](../../packages/contracts/test/SeedProposal.t.sol)
was run against the unchanged linked endpoint. The main RED had **3 passed,
5 failed**, retaining the original diagnostic/inward/sphere passes. In addition
to the isolated endpoint/path checks, the new expectations require a certified
but financially uncertain zero-budget result, and rejection when the full
two-event path has only one crossing allowance.

Only `_capN2High` and its conditional before the old high-point evaluation were
added to production `FrontierEndpoint.sol`. The four public pure entries and
their signatures remain unchanged. Composition, bracket, release, event,
rounding, fee and settlement code were not edited. The helper arithmetic tests
from the earlier isolated RED were then attached to the real helper, including
a maximum-length underflow guard.

The main focused GREEN passed **11/11**, followed by **153/153** in the affected
linked, endpoint, bracket, composition, event, schedule, turn and release suites.
The latter compiled six files in 89.13 seconds and ran thirteen suites in
3.67 seconds. All recorded inputs were unchanged during each observed run.
The existing hidden-domain/negative-price/equality/repartition deferrals remain
represented and passing. All named n2/n3/n8 and mixed-decimal output goldens,
the fourteen-event schedule and the successful order-refinement fallback pass.

```powershell
python test/evidence/seed-proposal/production-run.py production-red
python test/evidence/seed-proposal/production-run.py production-green
python test/evidence/seed-proposal/production-run.py production-regression
python -m unittest discover -s packages/reference/tests -p test_payout_resume.py -v
```

`production-red` is a historical pre-change run; replay against the promoted
source is expected to pass. Each stage's JSON records source hashes and exact
timestamps. The runner's regression selection was corrected after RED to name
the actual `SlackGridRelease`, `LinkedMath` and `FrontierCompositionGas` suites;
all three are present in the final 153-test transcript. It was unchanged during
the recorded GREEN/regression runs.

The independent reference passed **11/11** in 1.707 seconds with the added exact
main-test literal binding. Its 110/160-digit algorithm and numerical corpus did
not change; only historical status prose and the binding assertion changed.

| Final linked measurement | Observed value |
| --- | --- |
| Recovered fixture, cold external consumer call including ABI | `9,672,096` gas |
| Same fixture, measured linked body | `9,659,296` gas |
| First solve / resume / remaining midpoint ledger | `68 / 60 / 32` |
| `FrontierComposition` runtime | `22,253` bytes |
| `FrontierEndpoint` runtime | `18,812` bytes |
| Seed measurement consumer runtime | `2,960` bytes |
| Existing n2 / n3 / n8 linked consumer cold calls | `5,867,849 / 7,104,461 / 11,581,668` gas |
| Existing two-root / successful fallback cold calls | `6,231,123 / 9,793,724` gas |

The new measurement clears the linked-library and consumer access warming
before a deployed consumer calls the real production library graph. Runtime
checks use actual deployed code length. These are pure helper calls, not a
complete router transaction: settlement, storage, intrinsic gas, EIP-150 entry
headroom, worst-case configurations and verified Arc limits remain separate.
The pre-seed linked visibility evidence is retained as a historical source
snapshot, not relabeled as evidence for the changed endpoint body.

Final frozen source SHA256 values:

| Source | SHA256 |
| --- | --- |
| `FrontierEndpoint.sol` | `f78206eb22b466cd7c1215dc3d1fe0e56bf0155db64d0d7013d61ff10136ae7c` |
| `SeedProposal.t.sol` | `eb565a54196ca6dd5090fa4a0f63fc42a0e1e5220cc844bedc05027664a4d39a` |
| `fixtures_payout_resume.py` | `64c6dd448ebd138fef8d029dd895657a9e9bcc420fb1e05c55f40ae2f7d39b86` |
| `test_payout_resume.py` | `9cc99fbe15363af7fc34b9fced5bf96641b378cb788d04a7ec53c6de355af25b` |

Production GREEN began `2026-09-08T06:56:34.919259+00:00`; the full affected
regression began `2026-09-08T06:58:11.277591+00:00`. Their exact transcripts
and input-hash records are [GREEN](seed-proposal/production-green.json) and
[regression](seed-proposal/production-regression.json). The final transcript
SHA256 is `9287fad228d0117155725bc3e2cd770e297d1d4135d92dce6c8c9f347ce0173c`.
