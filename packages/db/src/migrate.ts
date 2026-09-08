import {readFile,readdir} from 'node:fs/promises';
import {database} from './index.js';
const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL required');
const pool=database(url);
try{
 const directory=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(file=>file.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,directory),'utf8'));
 console.log('Raw ingestion, lifecycle/invoice projections and separate swap-receipt coverage schema ready.');
}finally{await pool.end();}
