"""Independent exact n6 zero-price witness; no production arithmetic imports.

The event baskets are constructed from rational supporting prices, then summed
explicitly across two radius-S ticks. No event discriminant, Q128 coefficient,
or production solver is reused. Python Fractions and integer square root make
the zero-price assertion exact; increasing decimal precision is inapplicable.
This is a geometric witness, not a reachable raw-token execution history.
"""
from fractions import Fraction
from math import isqrt


def zero_price_fixture():
    s = 10**40
    p = (Fraction(0), Fraction(3, 4), Fraction(1, 2),
         Fraction(1, 4), Fraction(1, 4), Fraction(1, 4))
    basket = tuple(s*(1-price) for price in p)
    inward = tuple(2*value for value in basket)
    outward = (inward[0], inward[2], inward[1], *inward[3:])
    radicand = Fraction(51*s*s, 25)
    assert radicand.denominator == 1
    start = (2*s, 9*s//10, 2*s-isqrt(radicand.numerator),
             3*s//2, 3*s//2, 3*s//2)
    return {
        'dimension': 6, 'key': Fraction(4), 'radii': (s, s),
        'input': 1, 'output': 2, 'prices': p, 'start': start,
        'events': (inward, outward), 'net_input': s//5,
        'scope': 'Exact geometric zero-price witness; no reachable raw-token history or production schedule liveness claim',
    }
