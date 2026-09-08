import {pgTable,pgView,bigint,numeric,text,integer,jsonb,boolean,timestamp,primaryKey,foreignKey,index,unique,check} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {indexedBlocks,chainEvents} from './schema.js';

export const deployments=pgTable('deployments',{
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),
 aqua:text('aqua').notNull(),router:text('router').notNull(),payments:text('payments').notNull(),usdc:text('usdc').notNull(),
 startBlock:numeric('start_block',{precision:78,scale:0}).notNull(),identity:jsonb('identity').notNull(),verified:boolean('verified').notNull(),
 sourceHash:text('source_hash'),codeIdentity:jsonb('code_identity'),
},t=>[primaryKey({columns:[t.chainId,t.deploymentId]}),check('deployments_start_block_check',sql`${t.startBlock}>=0`),check('deployments_verified_check',sql`${t.verified}`)]);
export const deploymentBlocks=pgTable('deployment_blocks',{
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),height:numeric('height',{precision:78,scale:0}).notNull(),blockHash:text('block_hash').notNull(),projectionVersion:integer('projection_version').notNull(),swapProjectionVersion:integer('swap_projection_version').notNull().default(0),
},t=>[primaryKey({columns:[t.chainId,t.deploymentId,t.height]}),foreignKey({columns:[t.chainId,t.deploymentId],foreignColumns:[deployments.chainId,deployments.deploymentId]}),foreignKey({columns:[t.chainId,t.blockHash],foreignColumns:[indexedBlocks.chainId,indexedBlocks.hash]}).onDelete('cascade'),check('deployment_blocks_projection_version_check',sql`${t.projectionVersion}=1`),check('deployment_blocks_swap_projection_version_check',sql`${t.swapProjectionVersion} IN (0,1)`)]);
export const deploymentCursor=pgTable('deployment_cursor',{
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),height:numeric('height',{precision:78,scale:0}).notNull(),hash:text('hash').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.chainId,t.deploymentId]}),foreignKey({columns:[t.chainId,t.deploymentId],foreignColumns:[deployments.chainId,deployments.deploymentId]})]);
const receipt=()=>({blockNumber:numeric('block_number',{precision:78,scale:0}).notNull(),blockHash:text('block_hash').notNull(),txHash:text('tx_hash').notNull(),logIndex:integer('log_index').notNull()});
const strategyColumns=()=>({
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),router:text('router').notNull(),orderHash:text('order_hash').notNull(),maker:text('maker').notNull(),configHash:text('config_hash').notNull(),
 config:jsonb('config').notNull(),makerNonce:numeric('maker_nonce',{precision:78,scale:0}).notNull(),tokens:jsonb('tokens').notNull(),lifecycle:text('lifecycle').notNull(),version:numeric('version',{precision:78,scale:0}).notNull(),...receipt(),
});
export const strategySnapshots=pgTable('strategy_snapshots',strategyColumns(),t=>[
 primaryKey({columns:[t.chainId,t.deploymentId,t.orderHash,t.blockHash,t.txHash,t.logIndex]}),
 foreignKey({columns:[t.chainId,t.deploymentId],foreignColumns:[deployments.chainId,deployments.deploymentId]}),
 foreignKey({columns:[t.chainId,t.blockHash,t.txHash,t.logIndex],foreignColumns:[chainEvents.chainId,chainEvents.blockHash,chainEvents.txHash,chainEvents.logIndex]}).onDelete('cascade'),
 index('strategy_snapshot_latest').on(t.chainId,t.deploymentId,t.orderHash,t.blockNumber.desc(),t.logIndex.desc()),
 check('strategy_snapshots_maker_nonce_check',sql`${t.makerNonce}>=0`),check('strategy_snapshots_lifecycle_check',sql`${t.lifecycle} IN ('active','retired')`),check('strategy_snapshots_version_check',sql`${t.version}>0`),
]);
const invoiceColumns=()=>({
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),adapter:text('adapter').notNull(),invoiceId:text('invoice_id').notNull(),merchant:text('merchant').notNull(),
 amountDueRaw:numeric('amount_due_raw',{precision:78,scale:0}).notNull(),expiresAt:numeric('expires_at',{precision:78,scale:0}).notNull(),recipients:jsonb('recipients').notNull(),memoHash:text('memo_hash').notNull(),status:text('status').notNull(),version:numeric('version',{precision:78,scale:0}).notNull(),
 payer:text('payer'),tokenIn:text('token_in'),inputRaw:numeric('input_raw',{precision:78,scale:0}),receivedRaw:numeric('received_raw',{precision:78,scale:0}),refundRaw:numeric('refund_raw',{precision:78,scale:0}),routeHash:text('route_hash'),
 createdBlock:numeric('created_block',{precision:78,scale:0}).notNull(),createdHash:text('created_hash').notNull(),createdTx:text('created_tx').notNull(),createdLog:integer('created_log').notNull(),...receipt(),
});
export const invoiceSnapshots=pgTable('invoice_snapshots',invoiceColumns(),t=>[
 primaryKey({columns:[t.chainId,t.deploymentId,t.invoiceId,t.blockHash,t.txHash,t.logIndex]}),
 foreignKey({columns:[t.chainId,t.deploymentId],foreignColumns:[deployments.chainId,deployments.deploymentId]}),
 foreignKey({columns:[t.chainId,t.blockHash,t.txHash,t.logIndex],foreignColumns:[chainEvents.chainId,chainEvents.blockHash,chainEvents.txHash,chainEvents.logIndex]}).onDelete('cascade'),
 index('invoice_snapshot_latest').on(t.chainId,t.deploymentId,t.invoiceId,t.blockNumber.desc(),t.logIndex.desc()),
 check('invoice_snapshots_amount_due_raw_check',sql`${t.amountDueRaw}>0`),check('invoice_snapshots_expires_at_check',sql`${t.expiresAt}>0`),check('invoice_snapshots_status_check',sql`${t.status} IN ('unpaid','paid','cancelled')`),check('invoice_snapshots_version_check',sql`${t.version}>0`),
 check('invoice_snapshots_check',sql`(${t.status}='paid' AND ${t.payer} IS NOT NULL AND ${t.tokenIn} IS NOT NULL AND ${t.inputRaw}>0 AND ${t.receivedRaw}>=${t.amountDueRaw} AND ${t.refundRaw}=${t.receivedRaw}-${t.amountDueRaw} AND ${t.routeHash} IS NOT NULL) OR (${t.status}<>'paid' AND ${t.payer} IS NULL AND ${t.tokenIn} IS NULL AND ${t.inputRaw} IS NULL AND ${t.receivedRaw} IS NULL AND ${t.refundRaw} IS NULL AND ${t.routeHash} IS NULL)`),
]);
export const strategies=pgView('strategies',{...strategyColumns(),financialStateAvailable:boolean('financial_state_available')}).existing();
export const invoices=pgView('invoices',invoiceColumns()).existing();
export const invoiceRecipients=pgView('invoice_recipients',{
 chainId:bigint('chain_id',{mode:'number'}),deploymentId:text('deployment_id'),adapter:text('adapter'),invoiceId:text('invoice_id'),recipientIndex:integer('recipient_index'),recipient:text('recipient'),bps:integer('bps'),amountRaw:numeric('amount_raw',{precision:78,scale:0}),
}).existing();
export const invoicePayments=pgView('invoice_payments',{
 chainId:bigint('chain_id',{mode:'number'}),deploymentId:text('deployment_id'),adapter:text('adapter'),invoiceId:text('invoice_id'),merchant:text('merchant'),payer:text('payer'),tokenIn:text('token_in'),inputRaw:numeric('input_raw',{precision:78,scale:0}),receivedRaw:numeric('received_raw',{precision:78,scale:0}),refundRaw:numeric('refund_raw',{precision:78,scale:0}),routeHash:text('route_hash'),...receipt(),
}).existing();

const swapColumns=()=>({
 chainId:bigint('chain_id',{mode:'number'}).notNull(),deploymentId:text('deployment_id').notNull(),router:text('router').notNull(),orderHash:text('order_hash').notNull(),maker:text('maker').notNull(),taker:text('taker').notNull(),recipient:text('recipient').notNull(),
 tokenInIndex:integer('token_in_index').notNull(),tokenOutIndex:integer('token_out_index').notNull(),tokenIn:text('token_in').notNull(),tokenOut:text('token_out').notNull(),inputDecimals:integer('input_decimals').notNull(),outputDecimals:integer('output_decimals').notNull(),feePpm:integer('fee_ppm').notNull(),
 grossInputRaw:numeric('gross_input_raw',{precision:78,scale:0}).notNull(),netInputRaw:numeric('net_input_raw',{precision:78,scale:0}).notNull(),feeRaw:numeric('fee_raw',{precision:78,scale:0}).notNull(),amountOutRaw:numeric('amount_out_raw',{precision:78,scale:0}).notNull(),version:numeric('version',{precision:78,scale:0}).notNull(),crossedTickKeys:jsonb('crossed_tick_keys').notNull(),crossedInward:jsonb('crossed_inward').notNull(),...receipt(),
});
export const swapReceipts=pgTable('swap_receipts',swapColumns(),t=>[
 primaryKey({columns:[t.chainId,t.deploymentId,t.blockHash,t.txHash,t.logIndex]}),
 unique('swap_receipts_chain_id_deployment_id_order_hash_version_key').on(t.chainId,t.deploymentId,t.orderHash,t.version),
 index('swap_receipts_order_time').on(t.chainId,t.deploymentId,t.orderHash,t.blockNumber,t.logIndex),
 foreignKey({columns:[t.chainId,t.deploymentId],foreignColumns:[deployments.chainId,deployments.deploymentId]}),
 foreignKey({columns:[t.chainId,t.blockHash,t.txHash,t.logIndex],foreignColumns:[chainEvents.chainId,chainEvents.blockHash,chainEvents.txHash,chainEvents.logIndex]}).onDelete('cascade'),
 check('swap_receipts_money_check',sql`${t.grossInputRaw}>0 AND ${t.grossInputRaw}<2::numeric^256 AND ${t.netInputRaw}>0 AND ${t.netInputRaw}<2::numeric^256 AND ${t.feeRaw}>0 AND ${t.feeRaw}<2::numeric^256 AND ${t.amountOutRaw}>0 AND ${t.amountOutRaw}<2::numeric^256 AND ${t.netInputRaw}+${t.feeRaw}=${t.grossInputRaw} AND ${t.feeRaw}=div(${t.grossInputRaw}*${t.feePpm}+999999,1000000)`),
 check('swap_receipts_metadata_check',sql`${t.tokenInIndex} BETWEEN 0 AND 7 AND ${t.tokenOutIndex} BETWEEN 0 AND 7 AND ${t.tokenInIndex}<>${t.tokenOutIndex} AND ${t.tokenIn}<>${t.tokenOut} AND ${t.inputDecimals} BETWEEN 0 AND 18 AND ${t.outputDecimals} BETWEEN 0 AND 18 AND ${t.feePpm} IN (100,500,1000) AND ${t.maker}<>${t.taker} AND ${t.maker}<>${t.recipient}`),
 check('swap_receipts_version_check',sql`${t.version}>=2 AND ${t.version}<2::numeric^64`),
 check('swap_receipts_position_check',sql`${t.blockNumber}>=0 AND ${t.logIndex}>=0`),
 check('swap_receipts_crossings_check',sql`jsonb_typeof(${t.crossedTickKeys})='array' AND jsonb_typeof(${t.crossedInward})='array' AND jsonb_array_length(${t.crossedTickKeys})=jsonb_array_length(${t.crossedInward}) AND jsonb_array_length(${t.crossedTickKeys})<=16`),
]);
export const swapPairTotals=pgView('swap_pair_totals',{
 chainId:bigint('chain_id',{mode:'number'}),deploymentId:text('deployment_id'),router:text('router'),orderHash:text('order_hash'),maker:text('maker'),tokenIn:text('token_in'),tokenOut:text('token_out'),inputDecimals:integer('input_decimals'),outputDecimals:integer('output_decimals'),swapCount:bigint('swap_count',{mode:'bigint'}),grossInputRaw:numeric('gross_input_raw'),netInputRaw:numeric('net_input_raw'),feeRaw:numeric('fee_raw'),amountOutRaw:numeric('amount_out_raw'),
}).existing();
