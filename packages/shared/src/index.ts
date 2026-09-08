import {z} from 'zod';
export const addressSchema=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const nonzeroAddressSchema=addressSchema.refine(v=>!/^0x0{40}$/i.test(v),'Zero address');
export const hashSchema=z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const bytesSchema=z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
export const uintSchema=z.string().regex(/^(0|[1-9][0-9]*)$/).max(78).pipe(z.string().refine(v=>BigInt(v)<(1n<<256n),'uint256 overflow'));
export const uint64Schema=uintSchema.refine(v=>BigInt(v)<(1n<<64n),'uint64 overflow');
export const uint40Schema=uintSchema.refine(v=>BigInt(v)<(1n<<40n),'uint40 overflow');
export const chainIdSchema=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const tokenSchema=z.object({address:nonzeroAddressSchema,symbol:z.string().min(1).max(24),decimals:z.number().int().min(0).max(18),mock:z.boolean()}).strict();
export const manifestSchema=z.object({chainId:chainIdSchema,rpcUrl:z.string().url(),explorerUrl:z.string().url(),verified:z.boolean(),aqua:nonzeroAddressSchema,router:nonzeroAddressSchema,payments:nonzeroAddressSchema,usdc:nonzeroAddressSchema,startBlock:uintSchema,tokens:z.array(tokenSchema).min(2).max(8)}).strict().superRefine((m,ctx)=>{
 const addresses=m.tokens.map(t=>t.address.toLowerCase());
 if(new Set(addresses).size!==addresses.length)ctx.addIssue({code:'custom',message:'Duplicate deployment token',path:['tokens']});
 const usdc=m.tokens.find(t=>t.address.toLowerCase()===m.usdc.toLowerCase());
 if(!usdc||usdc.decimals!==6)ctx.addIssue({code:'custom',message:'USDC must be an allowlisted six-decimal token',path:['usdc']});
 const contracts=[m.aqua,m.router,m.payments].map(a=>a.toLowerCase());
 if(new Set(contracts).size!==3||contracts.some(a=>addresses.includes(a)))ctx.addIssue({code:'custom',message:'Deployment roles must be distinct',path:['router']});
});
export type DeploymentManifest=z.infer<typeof manifestSchema>;
export type Token=z.infer<typeof tokenSchema>;
export const quoteRequestSchema=z.object({wallet:nonzeroAddressSchema,recipient:nonzeroAddressSchema,tokenIn:nonzeroAddressSchema,tokenOut:nonzeroAddressSchema,amountInRaw:uintSchema.pipe(z.string().refine(v=>BigInt(v)>0n)),slippageBps:z.number().int().min(0).max(500),maxCrossings:z.number().int().min(0).max(16)}).strict().refine(v=>v.tokenIn.toLowerCase()!==v.tokenOut.toLowerCase(),'Distinct pair required');
export type QuoteRequest=z.infer<typeof quoteRequestSchema>;
export const paymentQuoteRequestSchema=z.object({invoiceId:hashSchema,payer:nonzeroAddressSchema,tokenIn:nonzeroAddressSchema,maxInputRaw:uintSchema.refine(v=>BigInt(v)>0n),maxCrossings:z.number().int().min(0).max(16)}).strict();
export type PaymentQuoteRequest=z.infer<typeof paymentQuoteRequestSchema>;
export const configDTOSchema=z.object({schemaVersion:z.literal(1),chainId:uintSchema,router:nonzeroAddressSchema,maker:nonzeroAddressSchema,makerNonce:uint64Schema,tokens:z.array(nonzeroAddressSchema).min(2).max(8),decimals:z.array(z.number().int().min(0).max(18)).min(2).max(8),tickKeys:z.array(uint64Schema).min(1).max(8),radiiInternal:z.array(uintSchema).min(1).max(8),feePpm:z.union([z.literal(100),z.literal(500),z.literal(1000)]),initialAmountsRaw:z.array(uintSchema).min(2).max(8)}).strict();
export type ConfigDTO=z.infer<typeof configDTOSchema>;
export const orderDTOSchema=z.object({maker:nonzeroAddressSchema,traits:uintSchema,data:bytesSchema.max(218)}).strict();
export type OrderDTO=z.infer<typeof orderDTOSchema>;
/** Public read observations, never a transaction target or arbitrary calldata. */
export const swapQuoteSchema=z.object({chainId:chainIdSchema,router:nonzeroAddressSchema,orderHash:hashSchema,configHash:hashSchema,caller:nonzeroAddressSchema,recipient:nonzeroAddressSchema,tokenIn:nonzeroAddressSchema,tokenOut:nonzeroAddressSchema,amountInRaw:uintSchema,amountOutRaw:uintSchema,feeRaw:uintSchema,stateVersion:uint64Schema,blockNumber:uintSchema,blockHash:hashSchema,expiresAt:uint40Schema,maxCrossings:z.number().int().min(0).max(16)}).strict();
export type SwapQuote=z.infer<typeof swapQuoteSchema>;
export type EvidenceStatus='verified'|'failed'|'not-run'|'unavailable';
export type ProofItem={id:string;label:string;status:EvidenceStatus;detail:string;artifact?:string};
export type ApiError={code:string;message:string};
export type TxStage='idle'|'preparing'|'needsApproval'|'approving'|'readyForReview'|'awaitingSignature'|'pending'|'confirmed'|'rejected'|'reverted'|'stale';

export const invoiceReceiptSchema=z.object({blockNumber:uintSchema,blockHash:hashSchema,txHash:hashSchema,logIndex:z.number().int().min(0).max(2147483647),event:z.enum(['InvoiceCreated','InvoicePaid','InvoiceCancelled'])}).strict();
export const invoiceReadSchema=z.object({
 invoiceId:hashSchema,merchant:nonzeroAddressSchema,adapter:nonzeroAddressSchema,amountDueRaw:uintSchema.refine(v=>BigInt(v)>0n),expiresAt:uint40Schema,
 recipients:z.array(z.object({address:nonzeroAddressSchema,bps:z.number().int().min(1).max(10000),amountRaw:uintSchema}).strict()).min(1).max(3),
 memoHash:hashSchema,status:z.enum(['unpaid','paid','cancelled']),version:uint64Schema,created:invoiceReceiptSchema,updated:invoiceReceiptSchema,
 settlementToken:tokenSchema,paymentEligibilityVerified:z.literal(false),
 payment:z.object({payer:nonzeroAddressSchema,tokenIn:nonzeroAddressSchema,inputToken:tokenSchema,inputRaw:uintSchema.refine(v=>BigInt(v)>0n),receivedRaw:uintSchema,refundRaw:uintSchema,routeHash:hashSchema,kind:z.enum(['direct','swap'])}).strict().nullable(),
}).strict().superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 // Zod may run object refinements after continuable child format errors.
 // Let those wire errors stand without feeding malformed text to BigInt.
 const amounts=[v.amountDueRaw,v.created.blockNumber,v.updated.blockNumber,...v.recipients.map(r=>r.amountRaw),
  ...(v.payment?[v.payment.inputRaw,v.payment.receivedRaw,v.payment.refundRaw]:[])];
 if(amounts.some(value=>!uintSchema.safeParse(value).success))return;
 const due=BigInt(v.amountDueRaw);let remaining=due;
 if(new Set(v.recipients.map(r=>r.address.toLowerCase())).size!==v.recipients.length||v.recipients.reduce((sum,r)=>sum+r.bps,0)!==10000)fail('Invalid recipient shares');
 for(let i=0;i<v.recipients.length;i++){const r=v.recipients[i]!;const amount=i+1===v.recipients.length?remaining:due*BigInt(r.bps)/10000n;remaining-=amount;if(BigInt(r.amountRaw)!==amount)fail('Invalid recipient split');}
 const same=v.created.blockNumber===v.updated.blockNumber&&v.created.blockHash===v.updated.blockHash&&v.created.txHash===v.updated.txHash&&v.created.logIndex===v.updated.logIndex;
 if(v.created.event!=='InvoiceCreated'||BigInt(v.created.blockNumber)>BigInt(v.updated.blockNumber)
  ||(v.created.blockNumber===v.updated.blockNumber&&(v.created.blockHash!==v.updated.blockHash||v.created.logIndex>v.updated.logIndex
   ||(v.status!=='unpaid'&&v.created.logIndex===v.updated.logIndex))))fail('Invalid invoice event order');
 if(v.status==='unpaid'?(v.version!=='1'||!same||v.updated.event!=='InvoiceCreated'||v.payment!==null)
  :(v.version!=='2'||same||v.updated.event!==(v.status==='paid'?'InvoicePaid':'InvoiceCancelled')||(v.status==='paid')!==(v.payment!==null)))fail('Invalid invoice status provenance');
 if(v.settlementToken.decimals!==6)fail('Invalid settlement token');
 if(v.payment){const p=v.payment,zero=/^0x0{64}$/i.test(p.routeHash),direct=p.tokenIn.toLowerCase()===v.settlementToken.address.toLowerCase();
  if(p.inputToken.address.toLowerCase()!==p.tokenIn.toLowerCase()||BigInt(p.receivedRaw)-BigInt(p.refundRaw)!==due||zero!==direct||p.kind!==(direct?'direct':'swap')
   ||(direct&&(p.inputRaw!==v.amountDueRaw||p.receivedRaw!==v.amountDueRaw||p.refundRaw!=='0')))fail('Invalid payment receipt');
 }
});
export type InvoiceReadDTO=z.infer<typeof invoiceReadSchema>;
export const invoiceListQuerySchema=z.object({limit:z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().int().max(50)).optional().default(20),cursor:z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
export const invoiceCursorSchema=z.object({version:z.literal(1),chainId:chainIdSchema,deploymentId:hashSchema,merchant:nonzeroAddressSchema,
 pin:z.object({height:uintSchema,hash:hashSchema}).strict(),after:z.object({createdBlock:uintSchema,createdLog:z.number().int().min(0).max(2147483647),invoiceId:hashSchema}).strict()}).strict();

const invoiceBlockSchema=z.object({height:uintSchema,hash:hashSchema}).strict();
/** Canonical read envelope, including a covered historical absence. Never a quote. */
export const invoiceDetailSchema=z.object({
 schemaVersion:z.literal(1),status:z.enum(['available','stale']),code:z.enum(['INVOICES_AVAILABLE','INVOICES_STALE','INVOICE_NOT_FOUND']),
 financialExecutionEnabled:z.literal(false),chainId:chainIdSchema,deploymentId:hashSchema,
 asOf:invoiceBlockSchema,currentIndexedBlock:invoiceBlockSchema,historical:z.boolean(),
 freshness:z.object({indexedAt:z.string().datetime(),ageMs:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),head:uintSchema,stale:z.boolean()}).strict(),
 coverage:z.object({fromBlock:uintSchema,toBlock:uintSchema,expectedBlocks:uintSchema,canonicalBlocks:uintSchema,coveredBlocks:uintSchema,complete:z.literal(true)}).strict(),
 data:z.object({invoice:invoiceReadSchema.nullable()}).strict(),
 message:z.string().max(500).optional(),retryable:z.boolean().optional(),field:z.string().nullable().optional(),requestId:z.string().max(200).optional(),
}).strict().superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 const c=v.coverage;
 if([v.asOf.height,v.currentIndexedBlock.height,v.freshness.head,c.fromBlock,c.toBlock,c.expectedBlocks,c.canonicalBlocks,c.coveredBlocks,
  ...(v.data.invoice?[v.data.invoice.created.blockNumber,v.data.invoice.updated.blockNumber]:[])].some(x=>!uintSchema.safeParse(x).success))return;
 const pin=BigInt(v.asOf.height),current=BigInt(v.currentIndexedBlock.height),start=BigInt(c.fromBlock),head=BigInt(v.freshness.head);
 if(pin>current||pin<start||v.historical!==(pin<current)||(pin===current&&v.asOf.hash!==v.currentIndexedBlock.hash))fail('Invalid indexed observation');
 if(head<pin+2n||v.freshness.stale!==(v.status==='stale')||v.freshness.stale!==(v.freshness.ageMs>10000||head!==current+2n))fail('Invalid freshness observation');
 if(c.toBlock!==v.asOf.height||BigInt(c.expectedBlocks)!==pin-start+1n||c.expectedBlocks!==c.canonicalBlocks||c.expectedBlocks!==c.coveredBlocks)fail('Incomplete canonical history');
 if(v.data.invoice){
  if(v.code!==(v.status==='stale'?'INVOICES_STALE':'INVOICES_AVAILABLE'))fail('Invalid invoice response status');
  if(BigInt(v.data.invoice.created.blockNumber)<start||BigInt(v.data.invoice.updated.blockNumber)>pin)fail('Receipt outside indexed history');
  for(const receipt of [v.data.invoice.created,v.data.invoice.updated])if(receipt.blockNumber===v.asOf.height&&receipt.blockHash!==v.asOf.hash)fail('Receipt conflicts with indexed block');
 }else if(v.code!=='INVOICE_NOT_FOUND'||v.retryable!==false||v.field!=='id')fail('Invalid indexed absence');
});
export type InvoiceDetailDTO=z.infer<typeof invoiceDetailSchema>;

export const strategyFiltersSchema=z.object({maker:nonzeroAddressSchema.optional(),tokenIn:nonzeroAddressSchema.optional(),tokenOut:nonzeroAddressSchema.optional(),status:z.enum(['all','active','retired']).default('all')}).strict().superRefine((v,ctx)=>{
 if(!!v.tokenIn!==!!v.tokenOut||(v.tokenIn&&v.tokenOut&&v.tokenIn.toLowerCase()===v.tokenOut.toLowerCase()))ctx.addIssue({code:'custom',message:'Distinct complete pair required'});
});
export const strategyListQuerySchema=z.object({maker:nonzeroAddressSchema.optional(),tokenIn:nonzeroAddressSchema.optional(),tokenOut:nonzeroAddressSchema.optional(),status:z.enum(['all','active','retired']).optional(),limit:z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().int().max(50)).optional().default(20),cursor:z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
export const strategyCursorSchema=z.object({version:z.literal(1),chainId:chainIdSchema,deploymentId:hashSchema,filters:strategyFiltersSchema,
 pin:z.object({height:uintSchema,hash:hashSchema}).strict(),after:z.object({blockNumber:uintSchema,logIndex:z.number().int().min(0).max(2147483647),orderHash:hashSchema}).strict()}).strict();
export const strategyReceiptSchema=z.object({blockNumber:uintSchema,blockHash:hashSchema,txHash:hashSchema,logIndex:z.number().int().min(0).max(2147483647),event:z.enum(['StrategyActivated','StrategyRetired','OrbitalSwapExecuted'])}).strict();
export const wideUintSchema=z.object({hi:uintSchema,lo:uintSchema}).strict();
export const strategyStateSchema=z.object({maker:nonzeroAddressSchema,configHash:hashSchema,status:z.union([z.literal(1),z.literal(2)]),version:uint64Schema,
 X:z.array(uintSchema).min(2).max(8),principalInternal:z.array(uintSchema).min(2).max(8),virtualInternal:uintSchema,sumInternal:uintSchema,sumSquaresInternal:wideUintSchema,
 interiorRadius:uintSchema,boundarySumNumerator:uintSchema,boundarySigmaLower:uintSchema,boundarySigmaUpper:uintSchema,interiorTickMask:z.number().int().min(1).max(255),slackBoundInternal:uintSchema,cumulativeFeeRaw:z.array(uintSchema).min(2).max(8),
}).strict();
export const strategyAvailabilitySchema=z.array(z.object({token:nonzeroAddressSchema,aquaAllocationRaw:uintSchema,liveTokenCount:z.number().int().min(0).max(255),walletBalanceRaw:uintSchema,aquaAllowanceRaw:uintSchema,live:z.boolean(),backingValid:z.boolean(),surplusInternal:wideUintSchema,deficitInternal:wideUintSchema,fundingCeilingRaw:uintSchema}).strict()).min(2).max(8);
export const strategyFinancialSchema=z.object({state:strategyStateSchema,availability:strategyAvailabilitySchema}).strict();
export const strategyReadSchema=z.object({orderHash:hashSchema,router:nonzeroAddressSchema,maker:nonzeroAddressSchema,configHash:hashSchema,config:configDTOSchema,order:orderDTOSchema,lifecycle:z.enum(['active','retired']),version:uint64Schema,activated:strategyReceiptSchema,updated:strategyReceiptSchema,tradeEligibilityVerified:z.literal(false),financial:strategyFinancialSchema.nullable()}).strict();
export type StrategyReadDTO=z.infer<typeof strategyReadSchema>;
export type StrategyFinancialDTO=z.infer<typeof strategyFinancialSchema>;

/** Strict read observations only. SDK validates deployment/request/configuration
 * and exact arithmetic; neither this schema nor a decoded result authorizes a transaction. */
const quoteCount=(max:number)=>z.number().int().min(0).max(max);
const quotePositiveUint=uintSchema.pipe(z.string().refine(v=>BigInt(v)>0n));
export const swapQuoteRouteSchema=z.object({kind:z.literal('swap'),payer:nonzeroAddressSchema,orderHash:hashSchema,configHash:hashSchema,config:configDTOSchema,
 stateVersion:uint64Schema.pipe(z.string().refine(v=>BigInt(v)>0n)),caller:nonzeroAddressSchema,recipient:nonzeroAddressSchema,tokenIn:nonzeroAddressSchema,tokenOut:nonzeroAddressSchema,
 amountInRaw:quotePositiveUint,amountOutRaw:quotePositiveUint,feeRaw:quotePositiveUint,feePpm:z.union([z.literal(100),z.literal(500),z.literal(1000)]),minimumOutRaw:quotePositiveUint,expiresAt:uint40Schema,maxCrossings:quoteCount(16),
}).strict();
export const swapQuoteDiagnosticSchema=z.object({orderHash:hashSchema,code:z.enum(['INVALID_CONFIGURATION','NOT_ACTIVE','SETTLEMENT_ROLE_CONFLICT','PAIR_UNSUPPORTED','INPUT_RANGE_UNSUPPORTED','NOT_INSPECTED_CAP','INSPECTION_MISSING','INSPECTION_FAILED','OUTPUT_UNAVAILABLE','INSPECTION_DATA_INVALID','QUOTE_MISSING','QUOTE_REVERTED','QUOTE_FAILED','PARTIAL_FILL','MINIMUM_NOT_MET','QUOTE_DATA_INVALID','QUOTED'])}).strict();
export const swapQuoteObservedSchema=z.object({schemaVersion:z.literal(1),status:z.literal('observed'),code:z.enum(['QUOTE_OBSERVED','NO_ROUTE_IN_INSPECTED_SET']),
 financialExecutionEnabled:z.literal(false),canonicalVerification:z.literal('verified_at_pin'),requestId:z.string().min(1).max(200),request:quoteRequestSchema,
 chainId:chainIdSchema,router:nonzeroAddressSchema,deploymentId:hashSchema,deploymentStartBlock:uintSchema,asOf:invoiceBlockSchema,currentIndexedBlock:invoiceBlockSchema,historical:z.boolean(),
 freshness:z.object({indexedAt:z.string().datetime(),ageMs:quoteCount(10000),head:uintSchema,blockTimestamp:uint40Schema,observedAt:z.string().datetime()}).strict(),
 data:z.object({best:swapQuoteRouteSchema.nullable(),alternatives:z.array(swapQuoteRouteSchema).max(3),
  counts:z.object({scanned:quoteCount(200),locallyAccepted:quoteCount(200),inspected:quoteCount(32),eligible:quoteCount(32),quoted:quoteCount(32),failed:quoteCount(200),notInspected:quoteCount(200)}).strict(),
  coverage:z.object({candidateLimit:z.literal(200),inspectionLimit:z.literal(32),scanTruncated:z.boolean(),scope:z.literal('bounded_registered_candidates')}).strict(),
  diagnostics:z.array(swapQuoteDiagnosticSchema).max(200),
 }).strict(),
}).strict().superRefine((v,ctx)=>{
 const c=v.data.counts,d=v.data.diagnostics;
 if(c.locallyAccepted>c.scanned||c.inspected!==Math.min(c.locallyAccepted,32)||c.notInspected!==c.locallyAccepted-c.inspected||c.eligible>c.inspected||c.quoted>c.eligible
  ||c.failed!==c.scanned-c.quoted-c.notInspected||d.length!==c.scanned||new Set(d.map(r=>r.orderHash.toLowerCase())).size!==d.length
  ||d.filter(r=>r.code==='QUOTED').length!==c.quoted||d.filter(r=>r.code==='NOT_INSPECTED_CAP').length!==c.notInspected
  ||(v.data.best===null)!==(c.quoted===0)||v.data.alternatives.length!==Math.min(3,Math.max(0,c.quoted-1))||v.code!==(c.quoted?'QUOTE_OBSERVED':'NO_ROUTE_IN_INSPECTED_SET'))ctx.addIssue({code:'custom',message:'Invalid bounded quote counts'});
});
export const swapQuoteUnavailableSchema=z.object({schemaVersion:z.literal(1),status:z.literal('unavailable'),code:z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),message:z.string().min(1).max(300),
 retryable:z.boolean(),field:z.enum(['body','query']).nullable(),requestId:z.string().min(1).max(200),financialExecutionEnabled:z.literal(false),canonicalVerification:z.literal('unavailable'),data:z.null(),
}).strict();
export const swapQuoteObservationSchema=z.discriminatedUnion('status',[swapQuoteObservedSchema,swapQuoteUnavailableSchema]);
export type SwapQuoteObservationDTO=z.infer<typeof swapQuoteObservationSchema>;
export type SwapQuoteObservedDTO=z.infer<typeof swapQuoteObservedSchema>;
