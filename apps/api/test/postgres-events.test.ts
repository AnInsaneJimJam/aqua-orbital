import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {EventEmitter} from 'node:events';
import {PostgresNotifications} from '../src/postgres-events.js';
import type {Invalidation} from '../src/events.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('PostgreSQL LISTEN publishes only committed valid notifications and unsubscribes cleanly', async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('TEST_DATABASE_URL required; PostgreSQL notification tests must not silently skip');
  // NOTIFY does not need fixture tables. Bound both connection and query waits
  // so a stopped Docker engine is reported rather than hanging this test.
  const pool = new pg.Pool({connectionString: url, max: 2, connectionTimeoutMillis: 2000, query_timeout: 2000, statement_timeout: 2000});
  const source = new PostgresNotifications(url);
  const events: Invalidation[] = [];
  const chainId = 9_000_000 + Math.floor(Math.random() * 1_000_000);
  const payload = {chainId, block: '1', hash: `0x${'ab'.repeat(32)}`};
  let lost = 0;
  let connection: pg.PoolClient | undefined;
  try {
    connection = await pool.connect();
    const unsubscribe = await source.subscribe(event => { if (event.chainId === chainId) events.push(event); }, () => { lost++; });
    await connection.query('BEGIN');
    await connection.query("SELECT pg_notify('orbital_blocks',$1)", [JSON.stringify(payload)]);
    await pause(30); assert.equal(events.length, 0);
    await connection.query('ROLLBACK');
    await pause(30); assert.equal(events.length, 0);
    await connection.query('BEGIN');
    await connection.query("SELECT pg_notify('orbital_blocks',$1)", [JSON.stringify(payload)]);
    await connection.query('COMMIT');
    for (let attempt = 0; !events.length && attempt < 50; attempt++) await pause(10);
    assert.deepEqual(events, [{type: 'block', ...payload}]);
    await connection.query("SELECT pg_notify('orbital_blocks',$1)", ['invalid payload']);
    unsubscribe();
    await connection.query("SELECT pg_notify('orbital_blocks',$1)", [JSON.stringify({...payload, block: '2'})]);
    await pause(30); assert.equal(events.length, 1); assert.equal(lost, 0);
  } finally { connection?.release(); await source.close(); await pool.end(); }
});

test('notification connection failures retry a bounded number of times and close every attempt', async () => {
  let attempts = 0, ended = 0;
  const factory = () => ({
    on() { return this; }, async connect() { attempts++; throw Error('private connection string'); },
    async end() { ended++; },
  }) as unknown as pg.Client;
  const source = new PostgresNotifications('not-used', factory, [0, 0]);
  try {
    await assert.rejects(() => source.subscribe(() => {}, () => {}), /NOTIFICATIONS_UNAVAILABLE/);
    assert.equal(attempts, 3); assert.equal(ended, 3);
  } finally { await source.close(); }
});

test('notification connection loss closes subscriptions and allows a fresh connection', async () => {
  class Client extends EventEmitter {
    ended = 0;
    async connect() {}
    async query() {}
    async end() { this.ended++; }
  }
  const clients: Client[] = [];
  const source = new PostgresNotifications('not-used', () => { const client = new Client(); clients.push(client); return client as unknown as pg.Client; }, [0, 0]);
  let unavailable = 0;
  try {
    await source.subscribe(() => {}, () => { unavailable++; });
    clients[0]!.emit('error', Error('private provider details'));
    assert.equal(unavailable, 1); assert.equal(clients[0]!.ended, 1);
    await source.subscribe(() => {}, () => { unavailable++; });
    assert.equal(clients.length, 2);
  } finally { await source.close(); }
  assert.equal(unavailable, 2); assert.equal(clients[1]!.ended, 1);
});
