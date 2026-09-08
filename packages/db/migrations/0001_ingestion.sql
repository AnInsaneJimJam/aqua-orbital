BEGIN;
CREATE TABLE IF NOT EXISTS indexed_blocks (
 chain_id bigint NOT NULL, height numeric(78,0) NOT NULL,
 hash text NOT NULL, parent_hash text NOT NULL,
 PRIMARY KEY(chain_id,height), UNIQUE(chain_id,hash)
);
CREATE TABLE IF NOT EXISTS chain_events (
 chain_id bigint NOT NULL, block_hash text NOT NULL,
 tx_hash text NOT NULL, log_index integer NOT NULL,
 emitter text NOT NULL, topic text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(chain_id,block_hash,tx_hash,log_index),
 FOREIGN KEY(chain_id,block_hash) REFERENCES indexed_blocks(chain_id,hash) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS indexer_cursor (
 chain_id bigint PRIMARY KEY, height numeric(78,0) NOT NULL, hash text NOT NULL
);
COMMIT;
