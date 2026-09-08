import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,atomicBlock} from '../src/index.js';
test('PostgreSQL commits block and cursor atomically; repeats are idempotent',async()=>{
 const base=process.env.TEST_DATABASE_URL;
 if(!base)throw Error('TEST_DATABASE_URL required; database integration must not silently skip');
 const schema=`orbital_test_${process.pid}_${Date.now()}`;
 const admin=database(base);await admin.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema}`);const pool=database(url.toString());
 try{
  await pool.query(await readFile(new URL('../migrations/0001_ingestion.sql',import.meta.url),'utf8'));
  const block={number:1n,hash:'0x01',parentHash:'0x00'};
  const event={txHash:'0x11',logIndex:0,emitter:'0xaa',topic:'0xbb',payload:{amount:'123456789012345678901234567890'}};
  await atomicBlock(pool,31337,block,[event]);await atomicBlock(pool,31337,block,[event]);
  assert.equal((await pool.query('SELECT count(*) FROM chain_events')).rows[0].count,'1');
  await assert.rejects(()=>atomicBlock(pool,31337,{number:2n,hash:'0x02',parentHash:'0xwrong'},[event]),/REORG/);
  assert.equal((await pool.query('SELECT height FROM indexer_cursor')).rows[0].height,'1');
  // Invalid event fails after block insertion; neither block nor cursor survives.
  await assert.rejects(()=>atomicBlock(pool,31337,{number:2n,hash:'0x02',parentHash:'0x01'},[{...event,logIndex:NaN}]));
  assert.equal((await pool.query('SELECT count(*) FROM indexed_blocks')).rows[0].count,'1');
  await atomicBlock(pool,31337,{number:2n,hash:'0x02',parentHash:'0x01'},[event]);
  assert.equal((await pool.query('SELECT height FROM indexer_cursor')).rows[0].height,'2');
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
