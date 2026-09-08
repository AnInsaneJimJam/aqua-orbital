BEGIN;
CREATE TABLE IF NOT EXISTS indexer_state (
 chain_id bigint PRIMARY KEY,
 status text NOT NULL CHECK (status IN ('indexing', 'resync_required')),
 reason text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
