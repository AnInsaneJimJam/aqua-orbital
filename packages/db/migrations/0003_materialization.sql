BEGIN;
ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS decoded_version integer;
ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS decoded_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS chain_events_block_log_unique ON chain_events(chain_id,block_hash,log_index);
CREATE TABLE IF NOT EXISTS deployments (
 chain_id bigint NOT NULL, deployment_id text NOT NULL,
 aqua text NOT NULL, router text NOT NULL, payments text NOT NULL, usdc text NOT NULL,
 start_block numeric(78,0) NOT NULL CHECK(start_block>=0),
 identity jsonb NOT NULL, verified boolean NOT NULL CHECK(verified),
 source_hash text, code_identity jsonb,
 PRIMARY KEY(chain_id,deployment_id)
);
CREATE TABLE IF NOT EXISTS deployment_blocks (
 chain_id bigint NOT NULL, deployment_id text NOT NULL, height numeric(78,0) NOT NULL,
 block_hash text NOT NULL, projection_version integer NOT NULL CHECK(projection_version=1),
 PRIMARY KEY(chain_id,deployment_id,height),
 FOREIGN KEY(chain_id,deployment_id) REFERENCES deployments(chain_id,deployment_id),
 FOREIGN KEY(chain_id,block_hash) REFERENCES indexed_blocks(chain_id,hash) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS deployment_cursor (
 chain_id bigint NOT NULL, deployment_id text NOT NULL,
 height numeric(78,0) NOT NULL, hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,deployment_id),
 FOREIGN KEY(chain_id,deployment_id) REFERENCES deployments(chain_id,deployment_id)
);
CREATE TABLE IF NOT EXISTS strategy_snapshots (
 chain_id bigint NOT NULL, deployment_id text NOT NULL, router text NOT NULL,
 order_hash text NOT NULL, maker text NOT NULL, config_hash text NOT NULL,
 config jsonb NOT NULL, maker_nonce numeric(78,0) NOT NULL CHECK(maker_nonce>=0), tokens jsonb NOT NULL,
 lifecycle text NOT NULL CHECK(lifecycle IN ('active','retired')),
 version numeric(78,0) NOT NULL CHECK(version>0),
 block_number numeric(78,0) NOT NULL, block_hash text NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL,
 PRIMARY KEY(chain_id,deployment_id,order_hash,block_hash,tx_hash,log_index),
 FOREIGN KEY(chain_id,deployment_id) REFERENCES deployments(chain_id,deployment_id),
 FOREIGN KEY(chain_id,block_hash,tx_hash,log_index) REFERENCES chain_events(chain_id,block_hash,tx_hash,log_index) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS strategy_snapshot_latest ON strategy_snapshots(chain_id,deployment_id,order_hash,block_number DESC,log_index DESC);
CREATE TABLE IF NOT EXISTS invoice_snapshots (
 chain_id bigint NOT NULL, deployment_id text NOT NULL, adapter text NOT NULL,
 invoice_id text NOT NULL, merchant text NOT NULL,
 amount_due_raw numeric(78,0) NOT NULL CHECK(amount_due_raw>0), expires_at numeric(78,0) NOT NULL CHECK(expires_at>0),
 recipients jsonb NOT NULL, memo_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('unpaid','paid','cancelled')), version numeric(78,0) NOT NULL CHECK(version>0),
 payer text, token_in text, input_raw numeric(78,0), received_raw numeric(78,0), refund_raw numeric(78,0), route_hash text,
 created_block numeric(78,0) NOT NULL, created_hash text NOT NULL, created_tx text NOT NULL, created_log integer NOT NULL,
 block_number numeric(78,0) NOT NULL, block_hash text NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL,
 PRIMARY KEY(chain_id,deployment_id,invoice_id,block_hash,tx_hash,log_index),
 FOREIGN KEY(chain_id,deployment_id) REFERENCES deployments(chain_id,deployment_id),
 FOREIGN KEY(chain_id,block_hash,tx_hash,log_index) REFERENCES chain_events(chain_id,block_hash,tx_hash,log_index) ON DELETE CASCADE,
 CHECK((status='paid' AND payer IS NOT NULL AND token_in IS NOT NULL AND input_raw>0 AND received_raw>=amount_due_raw AND refund_raw=received_raw-amount_due_raw AND route_hash IS NOT NULL)
  OR (status<>'paid' AND payer IS NULL AND token_in IS NULL AND input_raw IS NULL AND received_raw IS NULL AND refund_raw IS NULL AND route_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS invoice_snapshot_latest ON invoice_snapshots(chain_id,deployment_id,invoice_id,block_number DESC,log_index DESC);
CREATE OR REPLACE VIEW strategies AS
 SELECT DISTINCT ON(chain_id,deployment_id,order_hash) *,false AS financial_state_available
 FROM strategy_snapshots ORDER BY chain_id,deployment_id,order_hash,block_number DESC,log_index DESC;
CREATE OR REPLACE VIEW invoices AS
 SELECT DISTINCT ON(chain_id,deployment_id,invoice_id) *
 FROM invoice_snapshots ORDER BY chain_id,deployment_id,invoice_id,block_number DESC,log_index DESC;
CREATE OR REPLACE VIEW invoice_recipients AS
 SELECT i.chain_id,i.deployment_id,i.adapter,i.invoice_id,(r.ordinality-1)::integer AS recipient_index,
 r.value->>'address' AS recipient,(r.value->>'bps')::integer AS bps,
 CASE WHEN r.ordinality=jsonb_array_length(i.recipients) THEN i.amount_due_raw -
  (SELECT COALESCE(sum(floor(i.amount_due_raw*(p.value->>'bps')::numeric/10000)),0)
   FROM jsonb_array_elements(i.recipients) WITH ORDINALITY p(value,ordinality) WHERE p.ordinality<r.ordinality)
 ELSE floor(i.amount_due_raw*(r.value->>'bps')::numeric/10000) END::numeric(78,0) AS amount_raw
 FROM invoices i CROSS JOIN LATERAL jsonb_array_elements(i.recipients) WITH ORDINALITY r(value,ordinality);
CREATE OR REPLACE VIEW invoice_payments AS
 SELECT chain_id,deployment_id,adapter,invoice_id,merchant,payer,token_in,input_raw,received_raw,refund_raw,route_hash,
 block_number,block_hash,tx_hash,log_index FROM invoices WHERE status='paid';
COMMIT;
