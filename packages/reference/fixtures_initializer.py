"""Independent equal-point/virtual-minimum oracle; never used by live quotes.

The virtual minimum uses the paper's one-coordinate slice quadratic, not the
production sigma/virtual coefficient implementation. No Orbital production or
reference geometry is imported. Directed X is derived from the specified Q128
equal-point enclosure. Virtual/principal expectations are *bounds*, not a copy
of the production virtual rounding algorithm. Their unique raw ceilings fund
the actual Solidity initializer in the generated fixtures.
"""
from math import isqrt
from mpmath import mp

Q = 1 << 128
U = 1 << 64
GRID = 1 << 32
FULL = (1 << 64) - 1


def ceil_div(a, b):
    return (a + b - 1) // b


def case_specs():
    cases = [
        ('demo-three', 3, [6, 18, 6], [3*GRID//2, 7*GRID//4, FULL], [3*10**18*U]*3),
        ('unequal-radii', 3, [6, 18, 8], [3*GRID//2, 7*GRID//4, FULL],
         [10**12*U+1, 10**15*U+3, 4*10**18*U+17]),
        ('two-full', 2, [6, 18], [FULL], [4*10**18*U]),
        ('rational-four-full', 4, [0, 6, 8, 18], [FULL], [4*10**18*U+2]),
        ('minimum-width-three', 3, [6, 18, 6],
         [3*GRID-isqrt(3*GRID*GRID-3*GRID), 7*GRID//4, FULL], [3*10**18*U]*3),
    ]
    for n in (3, 5, 8):
        keys = [(n-1)*GRID-(7-i)*GRID//32 for i in range(7)] + [FULL]
        cases.append((f'eight-ticks-{n}', n, ([6, 18, 0, 8]*2)[:n], keys,
                      [(i+1)*10**18*U+i for i in range(8)]))
    for n in (2, 3, 5, 8):
        # Radius sum exactly 2^160-1, with an ordinary tick dominating the anchor.
        total = (1 << 160)-1
        anchor = 4*10**18*U+17
        small = 10**12*U+3
        cases.append((f'near-limit-{n}', n, ([6, 18, 8, 0]*2)[:n],
                      [(n-1)*GRID-GRID//4, (n-1)*GRID-GRID//8, FULL],
                      [total-anchor-small, small, anchor]))
    return cases


def virtual_minimum(n, key):
    """Normalized smaller root of n*m^2 - 2*b*m + (b-n+1)^2 = 0.

    Holding one coordinate at m makes every other coordinate (b-m)/(n-1).
    Their sphere equality yields this quadratic directly. This is the paper's
    x_min formula after substituting k=r*b/sqrt(n), independently of sigma.
    """
    if key == FULL:
        return mp.mpf(0)
    b = mp.mpf(key)/GRID
    if not n-mp.sqrt(n) < b < n-1:
        raise ValueError('invalid cap')
    if (n*GRID*GRID-(n*GRID-key)**2)*GRID < n*GRID*GRID:
        raise ValueError('cap below minimum width')
    minimum = (b-mp.sqrt(b*b-n*(b-n+1)**2))/n
    other = (b-minimum)/(n-1)
    tolerance = mp.power(10, -mp.dps+12)
    if abs((minimum-1)**2+(n-1)*(other-1)**2-1) > tolerance:
        raise ArithmeticError('slice sphere equality')
    if not 0 <= minimum <= other <= 1:
        raise ArithmeticError('minimum witness outside positive-price branch')
    return minimum


def fixture(spec):
    name, n, decimals, keys, radii = spec
    radius = sum(radii)
    equal = 1-1/mp.sqrt(n)
    equal_lo, equal_hi = int(mp.floor(Q*equal)), int(mp.ceil(Q*equal))
    coordinate = ceil_div(radius*equal_hi, Q)
    bracket_lower = radius*equal_lo//Q
    paper_x = mp.mpf(radius)*equal
    minima = [virtual_minimum(n, key) for key in keys]
    paper_virtual = mp.fsum(mp.mpf(r)*m for r, m in zip(radii, minima))
    paper_principal = paper_x-paper_virtual
    ordinary_r = sum(r for r, k in zip(radii, keys) if k != FULL)
    ordinary_count = sum(k != FULL for k in keys)
    # Per ordinary tick: coefficient deficit <4/Q and radius product floor <1.
    virtual_error_bound = ceil_div(4*ordinary_r, Q)+ordinary_count
    virtual_floor, virtual_ceil = int(mp.floor(paper_virtual)), int(mp.ceil(paper_virtual))
    virtual_lower = max(0, virtual_ceil-virtual_error_bound)
    principal_lower, principal_upper = coordinate-virtual_floor, coordinate-virtual_lower
    raw, paper_raw = [], []
    for precision in decimals:
        scale = 10**(18-precision)*U
        raw_lower, raw_upper = ceil_div(principal_lower, scale), ceil_div(principal_upper, scale)
        if raw_lower != raw_upper:
            raise ArithmeticError(f'{name}: independent principal enclosure straddles a raw ceiling at decimals={precision}')
        raw.append(str(raw_lower))
        paper_raw.append(str(int(mp.ceil(paper_principal/scale))))
    coordinate_error_bound = int(mp.ceil(coordinate-paper_x))
    # Compute the actual norm rather than using the implementation's slack rule.
    radial_slack = radius-mp.sqrt(mp.fsum((mp.mpf(radius)-coordinate)**2 for _ in range(n)))
    radial_ceil = int(mp.ceil(radial_slack))
    stored_slack_bound = (isqrt(n) if isqrt(n)**2 == n else isqrt(n)+1)*(coordinate-bracket_lower)
    if not 0 <= radial_slack <= stored_slack_bound < U:
        raise ArithmeticError('radial slack outside certified length bound')
    if not 0 <= coordinate-paper_x <= coordinate_error_bound:
        raise ArithmeticError('coordinate must round inward')
    tolerance = mp.power(10, -mp.dps+12)
    for r, key, minimum in zip(radii, keys, minima):
        # Explicit proportional per-tick witness; this is an independent
        # feasibility check of the actual directed aggregate initial point.
        x = mp.mpf(r)*coordinate/radius
        if n*(x-r)**2 > mp.mpf(r)**2*(1+tolerance):
            raise ArithmeticError('initial tick outside sphere')
        if key != FULL and n*x >= mp.mpf(r)*key/GRID:
            raise ArithmeticError('initial tick is not strictly interior')
        if not mp.mpf(r)*minimum <= x <= r:
            raise ArithmeticError('initial principal/supporting branch')
    values = dict(coordinate=coordinate, virtual_floor=virtual_floor,
                  virtual_ceil=virtual_ceil, virtual_lower=virtual_lower,
                  virtual_error_bound=virtual_error_bound,
                  principal_lower=principal_lower, principal_upper=principal_upper,
                  paper_principal_floor=int(mp.floor(paper_principal)),
                  coordinate_error_bound=coordinate_error_bound,
                  principal_error_bound=coordinate_error_bound+virtual_error_bound,
                  radial_slack_ceil=radial_ceil, stored_slack_bound=stored_slack_bound)
    return dict(name=name, n=n, decimals=decimals, keys=[str(k) for k in keys],
                radii=[str(r) for r in radii], raw=raw, paper_raw=paper_raw,
                **{key: str(value) for key, value in values.items()})


def corpus(dps):
    with mp.workdps(dps):
        return [fixture(spec) for spec in case_specs()]


def solidity_source(fixtures):
    fields = ['coordinate', 'virtual_floor', 'virtual_ceil', 'virtual_lower', 'virtual_error_bound',
              'principal_lower', 'principal_upper', 'paper_principal_floor', 'coordinate_error_bound',
              'principal_error_bound', 'radial_slack_ceil', 'stored_slack_bound']
    lines = ['// SPDX-License-Identifier: MIT', 'pragma solidity 0.8.30;',
             '// Generated by packages/reference/fixtures_initializer.py --write.',
             '// Independent 110/160-digit oracle enclosures; no production geometry import.',
             'import {OrbitalConfigV1} from "../../src/interfaces/IOrbitalRouter.sol";',
             'library InitializerOracleFixtures {', f'uint256 internal constant COUNT = {len(fixtures)};',
             'struct Expected {']
    lines += [f'uint256 {field};' for field in fields]
    lines += ['}', 'function get(uint256 index) internal pure returns (OrbitalConfigV1 memory c, Expected memory expected) {',
              'c.schemaVersion=1; c.chainId=31337; c.router=address(0x1111); c.maker=address(0x2222); c.feePpm=500;']
    for index, value in enumerate(fixtures):
        n = value['n']
        count = len(value['keys'])
        lines += [f'if(index=={index}){{ // {value["name"]}',
                  f'c.tokens=new address[]({n}); c.decimals=new uint8[]({n}); c.initialAmountsRaw=new uint256[]({n});',
                  f'c.tickKeys=new uint64[]({count}); c.radiiInternal=new uint192[]({count});']
        for i in range(n):
            lines += [f'c.tokens[{i}]=address({i+1}); c.decimals[{i}]={value["decimals"][i]}; c.initialAmountsRaw[{i}]={value["raw"][i]};']
        for i in range(count):
            lines += [f'c.tickKeys[{i}]={value["keys"][i]}; c.radiiInternal[{i}]={value["radii"][i]};']
        lines += [f'expected.{field}={value[field]};' for field in fields]
        lines += ['return (c, expected);', '}']
    return '\n'.join(lines+['revert("Unknown oracle fixture");', '}', '}'])+'\n'


if __name__ == '__main__':
    import json
    import sys
    from pathlib import Path
    result = corpus(160)
    if result != corpus(110):
        raise ArithmeticError('initialization fixture precision instability')
    encoded = json.dumps(result, indent=2)+'\n'
    if '--write' in sys.argv:
        base = Path(__file__).resolve().parent
        (base/'fixtures/initializer-oracle.json').write_text(encoded, encoding='utf-8')
        (base.parent/'contracts/test/fixtures/InitializerOracleFixtures.sol').write_text(solidity_source(result), encoding='utf-8')
        print(f'Wrote {len(result)} precision-stable initializer oracle fixtures.')
    else:
        print(encoded, end='')
