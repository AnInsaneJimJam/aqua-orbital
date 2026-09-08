import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNotification} from '../src/events.js';

const hash = `0x${'ab'.repeat(32)}`;
test('raw and reorg notifications become invalidations without inventing entities or carrying arbitrary fields', () => {
  assert.deepEqual(parseNotification(JSON.stringify({chainId: 31337, block: '10', hash, secret: 'discard me'})), {type: 'block', chainId: 31337, block: '10', hash});
  assert.deepEqual(parseNotification(JSON.stringify({type: 'reorg', chainId: 31337, block: '10', hash, removedBlocks: 2})), {type: 'reorg', chainId: 31337, block: '10', hash});
  const entity = {type: 'entity', chainId: 31337, block: '10', hash, entityKind: 'invoice', entityId: hash, version: '2'};
  assert.deepEqual(parseNotification(JSON.stringify(entity)), entity);
});
test('malformed, unknown and incomplete notifications are discarded', () => {
  for (const payload of ['not-json', '{}', '[]', JSON.stringify({chainId: 31337, block: '1e18', hash}), JSON.stringify({type: 'paid', chainId: 31337, block: '10', hash}), JSON.stringify({type: 'entity', chainId: 31337, block: '10', hash}), JSON.stringify({chainId: 31337, block: '10', hash: '0xwrong'})]) {
    assert.equal(parseNotification(payload), null);
  }
});
