import {readFile} from 'node:fs/promises';
import {database} from './index.js';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const pool=database(url);
try{await pool.query(await readFile(new URL('../migrations/0001_ingestion.sql',import.meta.url),'utf8'));console.log('Ingestion schema ready.');}finally{await pool.end();}
