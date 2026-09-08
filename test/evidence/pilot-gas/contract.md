# Pilot gas computation contract

Decision: locate costly phases of the retained `n8-t8-concentrated-step1`,
`step2` and `step3` before proposing a production optimization. These were
selected because the previous 128-action pilot recorded 14.23M, 18.37M and
17.62M diagnostic inner gas, beyond the provisional 13,421,772 headroom target.

The finite surrogate is three direct calls to the real linked
`FrontierComposition.certify`, plus separately measured public production
primitives for initial identity/release, ascending final-prefix discovery,
event scheduling and final endpoint certification. Fresh phase frames have
different memory expansion and cold/warm address costs from composition.
Their numbers must **not be summed as an exact production trace**.

Inputs come from the authenticated independent 110/160-digit pilot, with all
eight token coordinates, mixed decimals and eight radii retained. The generator
checks its source-generation hash record and output bytes before emitting
Solidity literals. The whole calls must match raw output, every actual reserve,
initial/final ideal prefix and every ordered transition. Shared 160-refinement
and 16-crossing ledgers and endpoint shortfall remain assertions. No production
code or expected result is modified in the baseline.

Arithmetic is the pinned production integer/512-bit implementation, with
U=2^64 and GRID=2^32. Foundry default configuration is Solidity 0.8.30,
optimizer 700, via IR, Cancun. Six deterministic tests run offline; no random
sampling or network transaction is performed. The runner freezes contract,
test, vendor and compiler inputs, streams the exact transcript and has a
900-second owned-child timeout. A timeout or failed fixture/check is a failed
measurement, not evidence of infeasibility or successful optimization.

Passing establishes these bounded identities and costs only. It does not
establish universal correctness/liveness, the full release matrix, full Aqua
settlement gas, minimum transaction gas limit, or Arc acceptance. The provisional
Arc transaction ceiling remains conditional in `docs/ARC_DEPLOYMENT_STATUS.md`.
