import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mpmath import mp
from orbital import Tick, aggregate, frontier_events, verify_baskets, swap


class EventTests(unittest.TestCase):
    def setUp(self):
        mp.dps = 110

    def test_both_roots_same_ending_partition(self):
        ticks = [Tick(1, mp.mpf(5)/8), Tick(1)]
        start = aggregate([2, 1], ticks)
        amount = 1/mp.sqrt(5) + mp.sqrt(7)/8
        events = frontier_events(start, ticks, 0, 1, amount)
        self.assertEqual([e['direction'] for e in events], ['inward', 'outward'])
        self.assertLess(events[0]['input'], events[1]['input'])
        for event in events:
            q = swap(start, ticks, 0, 1, event['input'])
            self.assertLess(abs(q['output']-event['output']), mp.mpf('1e-90'))
            self.assertLess(verify_baskets(q['end'], q['baskets'], ticks, q['prices']), mp.mpf('1e-90'))
        with mp.workdps(160):
            refined = frontier_events(aggregate([2, 1], ticks), ticks, 0, 1, 1/mp.sqrt(5)+mp.sqrt(7)/8)
        for a, b in zip(events, refined):
            self.assertLess(abs(a['input']-b['input']), mp.mpf('1e-90'))

    def test_reject_infeasible_primal_even_with_matching_sum(self):
        ticks = [Tick(1), Tick(1)]
        baskets = [[mp.mpf(-1), mp.mpf(1)], [mp.mpf(1), mp.mpf(0)]]
        with self.assertRaises(ValueError):
            verify_baskets([0, 1], baskets, ticks, [1, 1])

    def test_slack_start_is_used_as_actual_constraint(self):
        start = [mp.mpf(1), mp.mpf(1)+mp.mpf('0.001'), mp.mpf(1), mp.mpf(1)]
        q = swap(start, [Tick(2)], 0, 1, mp.mpf('0.5'))
        self.assertLess(abs(q['output']-(mp.sqrt(7)/2-1+mp.mpf('0.001'))), mp.mpf('1e-90'))

    def test_all_dimensions_explicit_basket_feasibility(self):
        for n in [2, 3, 4, 8, 16, 32]:
            # Reference range only; n>8 is not the onchain release profile.
            boundary = mp.mpf(n)-mp.sqrt(n)+mp.mpf('0.01')
            ticks = [Tick(1, boundary), Tick(2)]
            p = [mp.mpf('0.2')]+[mp.mpf(1)]*(n-1)
            from orbital import supporting_basket
            baskets = [supporting_basket(p,t) for t in ticks]
            self.assertLess(verify_baskets(aggregate(p,ticks),baskets,ticks,p),mp.mpf('1e-90'))
