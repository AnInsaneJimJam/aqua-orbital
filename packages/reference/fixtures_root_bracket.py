"""Independent supporting-basket root fixtures, never an onchain quote source.

Solve for a nonnegative price vector with output price fixed to one, matching
every other reserve by summing explicit per-tick supporting baskets. The
production torus/radical and Solidity root loop are not used as a root oracle.
The finite 110/160-digit agreement is numerical evidence, not an interval proof.
"""

from mpmath import mp
from fixtures_curve_primitives import corpus as scalar_corpus
from orbital import Tick, geometry, supporting_basket, verify_baskets

GRID = 2**32
SCALE = 10**40


def _case(item, index):
    n = item["n"]
    output = 1
    fixed = list(map(mp.mpf, item["x"]))
    ticks = [Tick(mp.mpf(r), None if k is None else mp.mpf(k) / GRID)
             for r, k in zip(item["radii"], item["keys"])]
    scale = sum(tick.radius for tick in ticks)
    indices = [i for i in range(n) if i != output]
    initial = ([2, 1] if n == 2 else [1, 3, 2] if n == 3 else list(range(1, 9)))

    def prices(weights):
        p = [mp.mpf(1)] * n
        for i, weight in zip(indices, weights):
            p[i] = weight
        return p

    def equations(*weights):
        rows = [supporting_basket(prices(weights), tick) for tick in ticks]
        return tuple((sum(row[i] for row in rows) - fixed[i]) / scale for i in indices)

    # Fixed, explicit finite work and precision-dependent numerical tolerance.
    # This solves reserve matching in price space; there is no scalar F residual.
    guess = tuple(mp.mpf(initial[i]) / initial[output] for i in indices)
    weights = mp.findroot(equations, guess, solver="mdnewton", maxsteps=30,
                          tol=mp.power(10, -mp.dps + 10), verify=True)
    p = prices(list(weights))
    assert all(value > 0 for value in p)
    supporting = [supporting_basket(p, tick) for tick in ticks]
    z = sum(row[output] for row in supporting)
    point = fixed.copy()
    point[output] = z
    tolerance = mp.power(10, -mp.dps + 20)
    assert max(abs(value) for value in equations(*weights)) < tolerance
    verify_baskets(point, supporting, ticks, p)

    # Independently reconstruct the stated reserve-selected partition and check
    # each MATH-7 basket, its principal/price bounds and analytic support cost.
    count = item["boundaries"]
    radius = sum(tick.radius for tick in ticks[count:])
    axial = sum(t.radius * t.boundary for t in ticks[:count])
    sigma = sum(t.radius * geometry(n, t)["sigma"] for t in ticks[:count])
    mean = sum(point) / n
    rho = mp.sqrt(sum((value - mean)**2 for value in point))
    assert rho > sigma
    h = (sum(point) - axial) / radius
    assert all(h > tick.boundary for tick in ticks[:count])
    assert all(tick.boundary is None or h < tick.boundary for tick in ticks[count:])
    u = [(value - mean) / rho for value in point]
    reconstructed = []
    for i, tick in enumerate(ticks):
        if i < count:
            row = [tick.radius * tick.boundary / n + tick.radius * geometry(n, tick)["sigma"] * v for v in u]
        else:
            row = [tick.radius / radius * ((sum(point) - axial) / n + (rho - sigma) * v) for v in u]
        reconstructed.append(row)
    verify_baskets(point, reconstructed, ticks, p)
    assert max(abs(a - b) for row, other in zip(reconstructed, supporting)
               for a, b in zip(row, other)) < tolerance * scale

    low = mp.mpf(103) * SCALE / 100 if n == 2 else fixed[output] - 10**28
    high = fixed[output]
    assert low < z < high
    if n == 2:
        # A second, analytic check special to two dimensions and z>fixed[0].
        left = axial + 2 * radius - fixed[0]
        right = fixed[0] + mp.sqrt(2) * sigma
        analytic = (left + right) / 2 - mp.sqrt(radius**2 - (left - right)**2 / 4)
        assert abs(z - analytic) < tolerance * scale
    return {"dimension": n, "fixture_index": index, "output": output,
            "boundary_count": count, "root_floor_grid": str(int(mp.floor(z * GRID))),
            "low_grid": str(int(low * GRID)), "high_grid": str(int(high * GRID))}


def corpus(dps):
    if not isinstance(dps, int) or dps < 80:
        raise ValueError("at least 80 decimal digits required")
    with mp.workdps(dps):
        # Only x, radii, exact keys and the named partition are used as inputs;
        # the scalar generator's residuals/normals are not an oracle here.
        items = scalar_corpus(dps)["scalars"]
        return {"coordinate_scale": "GRID=2^32 proof subunits per internal length",
                "cases": [_case(items[index], index) for index in (0, 2, 3)]}


if __name__ == "__main__":
    import json

    fixtures = corpus(160)
    assert fixtures == corpus(110)
    print(json.dumps(fixtures, indent=2))
