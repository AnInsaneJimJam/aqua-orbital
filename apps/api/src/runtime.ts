import {readShipmentEvents} from '@orbital/db';
import {aquaEventsAbi} from '@orbital/sdk';
import type {ShipmentDependencies} from './shipments.js';
import pg from 'pg';
import {createPublicClient, encodeEventTopics, http} from 'viem';
import {swapEventsAbi, paymentsEventsAbi, lifecycleEventsAbi} from '@orbital/sdk';
import {readReceiptMetrics, readInvoices, readStrategies} from '@orbital/db';
import type {ReadinessDependencies} from './readiness.js';
import type {MetricsDependencies} from './metrics.js';
import type {InvoiceReadDependencies} from './invoices.js';
import {readinessDeploymentScope} from './deployment-scope.js';
import type {StrategyReadDependencies} from './strategies.js';
import {readStrategyRpc} from './strategy-rpc.js';
import {readQuoteIdentity,readQuoteBatch,readPaymentContext} from './quote-rpc.js';
import {observeQuote as observeQuoteService,type QuoteDependencies,type QuoteOptions,type QuoteUnavailable} from './quote-service.js';
import type {RoutingIntent} from './route-selection.js';
import type {DeploymentManifest,PaymentQuoteRequest} from '@orbital/shared';
import {observePaymentQuote as observePaymentQuoteService,paymentUnavailable,type PaymentQuoteDependencies} from './payment-service.js';
import {createQuoteCache} from './quote-cache.js';

export function createReadDependencies(databaseUrl: string) {
  const pool = new pg.Pool({connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 3000});
  pool.on('error', () => {}); // A later readiness read reports the failure without leaking connection details.
  const shutdown = new AbortController();
  const quoteCache=createQuoteCache();
  let activeRpcRequests = 0;
  let activeQuoteServices=0,closing:Promise<void>|undefined;
  const reserveRpc=(weight:number)=>{
    if(!Number.isInteger(weight)||weight<1||weight>8||activeRpcRequests+weight>8||shutdown.signal.aborted)throw Error('RPC_CAPACITY');
    activeRpcRequests+=weight;let released=false;
    return ()=>{if(!released){released=true;activeRpcRequests-=weight;}};
  };
  const dependencies: ReadinessDependencies = {
    async readDatabase(manifest) {
      const scope = readinessDeploymentScope(manifest);
      // One statement means one MVCC snapshot: raw cursor, deployment cursor,
      // and canonical projection marker cannot be mixed across a commit/reorg.
      const result = await pool.query(`SELECT c.height,c.hash,s.status,s.updated_at,b.hash IS NOT NULL AS canonical,
        d.deployment_id,d.verified AND d.identity=$3::jsonb AND d.aqua=$4 AND d.router=$5 AND d.payments=$6
          AND d.usdc=$7 AND d.start_block=$8::numeric AS identity_matches,
        p.height AS projection_height,p.hash AS projection_hash,p.updated_at AS projection_updated_at,
        m.projection_version,pb.hash IS NOT NULL AS projection_canonical
        FROM indexer_cursor c JOIN indexer_state s ON s.chain_id=c.chain_id
        LEFT JOIN indexed_blocks b ON b.chain_id=c.chain_id AND b.height=c.height AND b.hash=c.hash
        LEFT JOIN deployments d ON d.chain_id=c.chain_id AND d.deployment_id=$2
        LEFT JOIN deployment_cursor p ON p.chain_id=d.chain_id AND p.deployment_id=d.deployment_id
        LEFT JOIN deployment_blocks m ON m.chain_id=p.chain_id AND m.deployment_id=p.deployment_id AND m.height=p.height AND m.block_hash=p.hash
        LEFT JOIN indexed_blocks pb ON pb.chain_id=m.chain_id AND pb.height=m.height AND pb.hash=m.block_hash
        WHERE c.chain_id=$1`, [scope.chainId, scope.id, JSON.stringify(scope.identity), scope.aqua, scope.router, scope.payments, scope.usdc, scope.startBlock]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        height: BigInt(row.height), hash: row.hash, status: row.status, updatedAt: new Date(row.updated_at), canonical: row.canonical === true,
        materialization: !row.deployment_id ? null : {
          deploymentId: row.deployment_id, identityMatches: row.identity_matches === true,
          cursor: row.projection_height === null ? null : {
            height: BigInt(row.projection_height), hash: row.projection_hash, updatedAt: new Date(row.projection_updated_at),
            canonical: row.projection_canonical === true, projectionVersion: row.projection_version,
          },
        },
      };
    },
    async readRpc(manifest, cursor) {
      // Each readiness check performs three independent reads. Two concurrent
      // groups stay below the repository's eight-request RPC concurrency limit.
      if (activeRpcRequests + 3 > 8 || shutdown.signal.aborted) throw Error('RPC_CAPACITY');
      activeRpcRequests += 3;
      // RPC is taken only from the server's verified manifest, never the request.
      const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(8000)]);
      try {
        const client = createPublicClient({cacheTime: 0, transport: http(manifest.rpcUrl, {timeout: 8000, retryCount: 2, fetchOptions: {signal}})});
        const [chainId, head, block] = await Promise.allSettled([
          client.getChainId(), client.getBlockNumber({cacheTime: 0}), client.getBlock({blockNumber: cursor.height}),
        ]);
        if (chainId.status !== 'fulfilled' || head.status !== 'fulfilled' || block.status !== 'fulfilled') throw Error('RPC_UNAVAILABLE');
        return {chainId: chainId.value, head: head.value, indexedBlockHash: block.value.hash};
      } finally { activeRpcRequests -= 3; }
    },
  };
  const metricsDependencies: MetricsDependencies = {
    readDatabase(manifest) {
      const scope = readinessDeploymentScope(manifest);
      return readReceiptMetrics(pool, {...scope, startBlock: BigInt(scope.startBlock)},
        encodeEventTopics({abi: swapEventsAbi, eventName: 'OrbitalSwapExecuted'})[0]!);
    },
    async readRpc(manifest, blocks) {
      // Cursor and both observed-date endpoints are deduplicated. Shared
      // accounting with readiness never permits more than eight RPC reads.
      if (blocks.length < 1 || blocks.length > 3 || new Set(blocks.map(block => block.height)).size !== blocks.length) throw Error('INVALID_METRICS_BLOCKS');
      const count = blocks.length + 2;
      if (activeRpcRequests + count > 8 || shutdown.signal.aborted) throw Error('RPC_CAPACITY');
      activeRpcRequests += count;
      const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(8000)]);
      try {
        const client = createPublicClient({cacheTime: 0, transport: http(manifest.rpcUrl, {timeout: 8000, retryCount: 2, fetchOptions: {signal}})});
        const [chain, head, ...observed] = await Promise.allSettled([
          client.getChainId(), client.getBlockNumber({cacheTime: 0}),
          ...blocks.map(block => client.getBlock({blockNumber: BigInt(block.height)})),
        ] as const);
        if (chain.status !== 'fulfilled' || head.status !== 'fulfilled' || observed.some(block => block.status !== 'fulfilled')) throw Error('RPC_UNAVAILABLE');
        return {chainId: chain.value, head: head.value, blocks: observed.map((item, index) => {
          if (item.status !== 'fulfilled' || item.value.number === null) throw Error('RPC_UNAVAILABLE');
          if (item.value.number.toString() !== blocks[index]!.height) throw Error('RPC_BLOCK_MISMATCH');
          return {height: item.value.number.toString(), hash: item.value.hash, timestamp: item.value.timestamp};
        })};
      } finally { activeRpcRequests -= count; }
    },
  };
  const invoiceDependencies: InvoiceReadDependencies = {
    readDatabase(manifest, query) {
      const scope = readinessDeploymentScope(manifest);
      return readInvoices(pool, {...scope, startBlock: BigInt(scope.startBlock)}, {
        created: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoiceCreated'})[0]!,
        paid: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoicePaid'})[0]!,
        cancelled: encodeEventTopics({abi: paymentsEventsAbi, eventName: 'InvoiceCancelled'})[0]!,
      }, query);
    },
    readRpc: metricsDependencies.readRpc,
  };
  const strategyDependencies:StrategyReadDependencies={
    readDatabase(manifest,query){
      const scope=readinessDeploymentScope(manifest);
      return readStrategies(pool,{...scope,startBlock:BigInt(scope.startBlock)},{
        activated:encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyActivated'})[0]!,
        retired:encodeEventTopics({abi:lifecycleEventsAbi,eventName:'StrategyRetired'})[0]!,
        swap:encodeEventTopics({abi:swapEventsAbi,eventName:'OrbitalSwapExecuted'})[0]!,
      },query);
    },
    readRpc:(manifest,pin,orderHash)=>readStrategyRpc(manifest,pin,orderHash,{reserve:reserveRpc,shutdownSignal:shutdown.signal}),
  };
  const shipmentDependencies:ShipmentDependencies={strategies:strategyDependencies,events:(m,pin,maker,limit,after)=>{
   const scope=readinessDeploymentScope(m);return readShipmentEvents(pool,{...scope,startBlock:BigInt(scope.startBlock)},pin,maker,{shipped:encodeEventTopics({abi:aquaEventsAbi,eventName:'Shipped'})[0]!,docked:encodeEventTopics({abi:aquaEventsAbi,eventName:'Docked'})[0]!},limit,after);
  }};
  const quoteDependencies:QuoteDependencies={
    readDatabase:(manifest,query)=>strategyDependencies.readDatabase(manifest,query),
    readIdentity:(manifest,pin,signal,timeoutMs)=>readQuoteIdentity(manifest,pin,{reserve:reserveRpc,shutdownSignal:shutdown.signal,signal,timeoutMs}),
    readBatch:(input,phase,signal,timeoutMs,onCacheHit)=>readQuoteBatch(input,phase,{reserve:reserveRpc,shutdownSignal:shutdown.signal,signal,timeoutMs,cache:quoteCache,...(onCacheHit?{onCacheHit}:{})}),
  };
  function quoteLease(options:QuoteOptions){
    activeQuoteServices++;
    const pendingDatabase=new Set<Promise<unknown>>();let released=false;
    function track<T>(operation:Promise<T>):Promise<T>{
      pendingDatabase.add(operation);
      operation.then(()=>pendingDatabase.delete(operation),()=>pendingDatabase.delete(operation));
      return operation;
    }
    return {track,signal:AbortSignal.any([shutdown.signal,...(options.signal?[options.signal]:[])]),release(){
      if(released)return;released=true;
      // AbortSignal ends the response promptly but does not cancel PostgreSQL.
      // Keep admission occupied until the complete read transaction (including
      // rollback and client release) settles under the pool/query time bounds.
      if(pendingDatabase.size)void Promise.allSettled([...pendingDatabase]).then(()=>{activeQuoteServices--;});
      else activeQuoteServices--;
    }};
  }
  async function observeQuote(manifest:DeploymentManifest|null,intent:RoutingIntent,options:QuoteOptions={}){
    // Immediate shared admission, with no queue, for either kind of quote.
    if(shutdown.signal.aborted||activeQuoteServices>=2){const result:QuoteUnavailable={schemaVersion:1,status:'unavailable',code:shutdown.signal.aborted?'QUOTE_CANCELLED':'QUOTE_CAPACITY',financialExecutionEnabled:false,canonicalVerification:'unavailable',data:null,message:'A complete canonical quote observation is unavailable.'};return result;}
    const lease=quoteLease(options),serviceDependencies:QuoteDependencies={...quoteDependencies,readDatabase:(manifest,query)=>lease.track(quoteDependencies.readDatabase(manifest,query))};
    try{return await observeQuoteService(manifest,intent,serviceDependencies,{...options,signal:lease.signal});}
    finally{lease.release();}
  }
  async function observePaymentQuote(manifest:DeploymentManifest|null,request:PaymentQuoteRequest,options:QuoteOptions={}){
    if(shutdown.signal.aborted||activeQuoteServices>=2)return paymentUnavailable(shutdown.signal.aborted?'PAYMENT_QUOTE_CANCELLED':'PAYMENT_QUOTE_CAPACITY',shutdown.signal.aborted?503:429);
    const lease=quoteLease(options),serviceDependencies:PaymentQuoteDependencies={...quoteDependencies,
      readDatabase:(manifest,query)=>lease.track(quoteDependencies.readDatabase(manifest,query)),
      readInvoices:(manifest,query)=>lease.track(invoiceDependencies.readDatabase(manifest,query)),
      readContext:(input,signal,timeoutMs)=>readPaymentContext(input,{reserve:reserveRpc,shutdownSignal:shutdown.signal,signal,timeoutMs}),
    };
    try{return await observePaymentQuoteService(manifest,request,serviceDependencies,{...options,signal:lease.signal});}
    finally{lease.release();}
  }
  return {shipmentDependencies,dependencies, metricsDependencies, invoiceDependencies, strategyDependencies, observeQuote, observePaymentQuote, close: () => { shutdown.abort(); quoteCache.clear(); return closing??=pool.end(); }};
}
