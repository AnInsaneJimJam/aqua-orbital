"""Independent analytic oracle for the initial real-router interior trades.

No Solidity math or reference consolidated solver is imported. Python's exact
integer square root constructs the specified initial lattice point. High-
precision square roots and explicit per-tick supporting baskets establish the
ideal trade; exact integer inequalities check the final raw payout.
"""
from math import isqrt
from mpmath import mp

Q, U, GRID = 1 << 128, 1 << 64, 1 << 32
RADII = [100 * 10**18 * U, 200 * 10**18 * U, 400 * 10**18 * U]
KEYS = [3 * GRID // 2, 7 * GRID // 4, None]
DECIMALS = [6, 18, 6]


def fixtures(dps=110):
    with mp.workdps(dps):
        radius = sum(RADII)
        x = (radius * (Q - isqrt(Q * Q // 3)) + Q - 1) // Q
        records = []
        for whole_input in (1, 6):
            for i in range(3):
                for j in range(3):
                    if i == j:
                        continue
                    gross = whole_input * 10**DECIMALS[i]
                    fee = (gross * 500 + 999999) // 1000000
                    scale_in, scale_out = 10**(18-DECIMALS[i])*U, 10**(18-DECIMALS[j])*U
                    target = [mp.mpf(x)] * 3
                    target[i] += (gross-fee)*scale_in
                    target[j] = radius-mp.sqrt(radius**2-sum((radius-target[k])**2 for k in range(3) if k != j))
                    raw_output = int(mp.floor((x-target[j])/scale_out))
                    prices = [radius-value for value in target]
                    norm = mp.sqrt(sum(p*p for p in prices))
                    baskets = [[r*(1-p/norm) for p in prices] for r in RADII]
                    tolerance = mp.mpf('1e-90')
                    for r, key, basket in zip(RADII, KEYS, baskets):
                        assert abs(sum((v-r)**2 for v in basket)/r**2-1) < tolerance
                        assert min(basket) >= 0 and max(basket) <= r
                        if key is not None:
                            assert sum(basket)/r < mp.mpf(key)/GRID
                            b = mp.mpf(key)/GRID
                            minimum = (b-mp.sqrt(b*b-3*(b-2)**2))/3
                            assert min(basket)/r >= minimum
                    for k in range(3):
                        assert abs(sum(b[k] for b in baskets)-target[k])/radius < tolerance
                    actual = [x]*3
                    actual[i] += (gross-fee)*scale_in
                    actual[j] -= raw_output*scale_out
                    norm_squared = sum((radius-v)**2 for v in actual)
                    assert norm_squared <= radius**2
                    one_extra = norm_squared-(radius-actual[j])**2+(radius-actual[j]+scale_out)**2
                    assert one_extra > radius**2
                    assert sum(actual)*GRID < radius*KEYS[0]
                    records.append(dict(input=i, output=j, whole_input=whole_input,
                                        gross=gross, fee=fee, amount_out_raw=raw_output))
        return dict(initial_x=x, cases=records)


if __name__ == '__main__':
    import json
    result = fixtures(110)
    assert result == fixtures(160)
    print(json.dumps(result, indent=2))
