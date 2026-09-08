import {readFile, readdir} from 'node:fs/promises';
import {database} from '../src/index.js';

export async function isolatedDatabase() {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw Error('TEST_DATABASE_URL required; PostgreSQL tests must not silently skip');
  const schema = `orbital_test_${process.pid}_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = database(base);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(base);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool = database(url.toString());
  try {
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
      await pool.query(await readFile(new URL(file, directory), 'utf8'));
    }
  } catch (error) {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    throw error;
  }
  return {
    pool,
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
