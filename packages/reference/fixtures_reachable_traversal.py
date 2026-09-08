"""Independent initialized token-unit traversal sequence; not a live quote.

The initial point/funding bounds come from the separate paper slice oracle.
Each subsequent start is the prior actual raw-token payout endpoint, with fees
kept in a distinct inventory. Per-tick price-space solves certify only the
recorded numerical family; actual Aqua/router execution remains a separate test.
"""
from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path

from mpmath import mp
from fixtures_initializer import fixture, FULL, GRID, U
from fixtures_frontier_composition import _case


@lru_cache(maxsize=2)
def _corpus(dps):
    with mp.workdps(dps):
        radii = [r*10**18*U for r in [100, 200, 400]]
        keys = [3*GRID//2, 7*GRID//4, FULL]
        decimals = [6, 18, 6]
        initial = fixture(('initialized-three-token-traversal', 3, decimals, keys, radii))
        start = [int(initial['coordinate'])]*3
        initial['directed_reserves'] = list(map(str, start))
        fees = [0]*3
        swaps = []
        # Gross amounts are financial inputs, not searched production outputs.
        # The reverse endpoint needs a different numerical initial price guess:
        # following the old endpoint guess directly gives a singular Newton
        # Jacobian. The positive proposal below is independently validated by
        # the same support equations, all primal baskets and path samples.
        for name, gross, token_in, token_out, final_guess in [
            ('initialized-n3-outward', 350_000_000, 0, 2, None),
            ('initialized-n3-double', 500_000_000, 2, 0, [10, 7, 1]),
        ]:
            fee = (gross*500+999_999)//1_000_000
            witness = _case(name, start, radii, keys[:-1]+[None], decimals,
                            gross-fee, [1, 1, 1], token_in, token_out,
                            final_guess=final_guess)
            fees[token_in] += fee
            # This label distinguishes a derived local token-unit history from
            # a claimed transaction receipt or a universal reachability proof.
            witness['scope'] = 'derived initialized raw-token sequence; onchain execution unverified'
            witness['reachable_raw_history_verified'] = False
            swaps.append({'gross_input_raw': str(gross), 'fee_raw': str(fee),
                          'cumulative_fees_raw': list(map(str, fees)),
                          'final_price_guess': final_guess, 'witness': witness})
            start = list(map(int, witness['actual_endpoint']))
        return {'schema_version': 1, 'initial': initial, 'fee_ppm': 500,
                'swaps': swaps, 'precisions_checked': [110, 160],
                'non_claims': ['actual router/Aqua execution', 'deployed receipts',
                               'universal path theorem', 'complete supported-range coverage']}


def corpus(dps):
    if isinstance(dps, bool) or not isinstance(dps, int) or dps < 80:
        raise ValueError('at least 80 integer decimal digits required')
    return deepcopy(_corpus(dps))


if __name__ == '__main__':
    import sys
    result = corpus(110)
    assert result == corpus(160)
    encoded = json.dumps(result, indent=2)+'\n'
    if '--write' in sys.argv:
        (Path(__file__).parent/'fixtures/reachable-traversal.json').write_text(encoded, encoding='utf-8')
        print('Wrote precision-stable initialized traversal sequence.')
    else:
        print(encoded, end='')
