import test from 'node:test';
import assert from 'node:assert/strict';
import {testStartBlock} from '../lib/arc-test-profile.mjs';

test('default retains deployment history; explicit test cutoff is bounded and stable', () => {
  const manifest = {chainId: 5042002, startBlock: '100'};
  assert.equal(testStartBlock(undefined, manifest, 200n, false), '100');
  assert.equal(testStartBlock('198', manifest, 200n, true), '198');
  assert.equal(testStartBlock('198', manifest, 500n, true), '198');
  assert.equal(manifest.startBlock, '100');
  for (const value of ['99', '199', '-1', '1.5', '01', '', 'latest']) {
    assert.throws(() => testStartBlock(value, manifest, 200n, true));
  }
  assert.throws(() => testStartBlock('198', manifest, 200n, false));
  assert.throws(() => testStartBlock('198', {...manifest, chainId: 1}, 200n, true));
});
