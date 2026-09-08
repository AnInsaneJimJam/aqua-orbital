BEGIN;
-- Projection v1 still means lifecycle/invoice coverage. Swap coverage is separate
-- and defaults to unknown for every block processed by the earlier worker.
ALTER TABLE deployment_blocks ADD COLUMN IF NOT EXISTS swap_projection_version integer NOT NULL DEFAULT 0 CHECK(swap_projection_version IN (0,1));
CREATE TABLE IF NOT EXISTS swap_receipts (
 chain_id bigint NOT NULL, deployment_id text NOT NULL, router text NOT NULL,
 order_hash text NOT NULL, maker text NOT NULL, taker text NOT NULL, recipient text NOT NULL,
 token_in_index integer NOT NULL CHECK(token_in_index BETWEEN 0 AND 7), token_out_index integer NOT NULL CHECK(token_out_index BETWEEN 0 AND 7),
 token_in text NOT NULL, token_out text NOT NULL,
 input_decimals integer NOT NULL CHECK(input_decimals BETWEEN 0 AND 18), output_decimals integer NOT NULL CHECK(output_decimals BETWEEN 0 AND 18),
 fee_ppm integer NOT NULL CHECK(fee_ppm IN (100,500,1000)),
 gross_input_raw numeric(78,0) NOT NULL CHECK(gross_input_raw>0 AND gross_input_raw<2::numeric^256),
 net_input_raw numeric(78,0) NOT NULL CHECK(net_input_raw>0 AND net_input_raw<2::numeric^256),
 fee_raw numeric(78,0) NOT NULL CHECK(fee_raw>0 AND fee_raw<2::numeric^256),
 amount_out_raw numeric(78,0) NOT NULL CHECK(amount_out_raw>0 AND amount_out_raw<2::numeric^256),
 version numeric(78,0) NOT NULL CHECK(version>=2 AND version<2::numeric^64),
 crossed_tick_keys jsonb NOT NULL, crossed_inward jsonb NOT NULL,
 block_number numeric(78,0) NOT NULL CHECK(block_number>=0), block_hash text NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL CHECK(log_index>=0),
 PRIMARY KEY(chain_id,deployment_id,block_hash,tx_hash,log_index),
 UNIQUE(chain_id,deployment_id,order_hash,version),
 FOREIGN KEY(chain_id,deployment_id) REFERENCES deployments(chain_id,deployment_id),
 FOREIGN KEY(chain_id,block_hash,tx_hash,log_index) REFERENCES chain_events(chain_id,block_hash,tx_hash,log_index) ON DELETE CASCADE,
 CHECK(token_in_index<>token_out_index AND token_in<>token_out AND maker<>taker AND maker<>recipient),
 -- PostgreSQL numeric '/' may round before ceil at large magnitudes. div is
 -- exact integer quotient; all operands are positive integers here.
 CHECK(net_input_raw+fee_raw=gross_input_raw AND fee_raw=div(gross_input_raw*fee_ppm+999999,1000000)),
 CHECK(jsonb_typeof(crossed_tick_keys)='array' AND jsonb_typeof(crossed_inward)='array' AND jsonb_array_length(crossed_tick_keys)=jsonb_array_length(crossed_inward) AND jsonb_array_length(crossed_tick_keys)<=16)
);
CREATE INDEX IF NOT EXISTS swap_receipts_order_time ON swap_receipts(chain_id,deployment_id,order_hash,block_number,log_index);
CREATE OR REPLACE VIEW swap_pair_totals AS
 SELECT chain_id,deployment_id,router,order_hash,maker,token_in,token_out,input_decimals,output_decimals,
 count(*) AS swap_count,sum(gross_input_raw) AS gross_input_raw,sum(net_input_raw) AS net_input_raw,
 sum(fee_raw) AS fee_raw,sum(amount_out_raw) AS amount_out_raw
 FROM swap_receipts GROUP BY chain_id,deployment_id,router,order_hash,maker,token_in,token_out,input_decimals,output_decimals;

-- Correct the same pre-floor rounding class in the existing invoice view.
-- This is additive: applied migration0003 and every stored invoice are intact.
CREATE OR REPLACE VIEW invoice_recipients AS
 SELECT i.chain_id,i.deployment_id,i.adapter,i.invoice_id,(r.ordinality-1)::integer AS recipient_index,
 r.value->>'address' AS recipient,(r.value->>'bps')::integer AS bps,
 CASE WHEN r.ordinality=jsonb_array_length(i.recipients) THEN i.amount_due_raw -
  (SELECT COALESCE(sum(div(i.amount_due_raw*(p.value->>'bps')::numeric,10000)),0)
   FROM jsonb_array_elements(i.recipients) WITH ORDINALITY p(value,ordinality) WHERE p.ordinality<r.ordinality)
 ELSE div(i.amount_due_raw*(r.value->>'bps')::numeric,10000) END::numeric(78,0) AS amount_raw
 FROM invoices i CROSS JOIN LATERAL jsonb_array_elements(i.recipients) WITH ORDINALITY r(value,ordinality);
COMMIT;
