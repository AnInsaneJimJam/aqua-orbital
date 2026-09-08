import {manifestSchema, quoteRequestSchema, swapQuoteObservationSchema, isFreshIndexedHead, type DeploymentManifest, type QuoteRequest, type SwapQuoteObservationDTO} from '@orbital/shared';
import {encodeAbiParameters, keccak256, type Address} from 'viem';
import {buildOrder, feeIn, hashConfig, hashOrder} from './codec';
import {configFromDTO} from './dto';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const invalid = (message: string): never => { throw Error(message); };

/** Validates a public read observation, never a transaction authorization. */
export function decodeSwapQuoteObservation(input: unknown, httpStatus: number, configured: DeploymentManifest, requested: QuoteRequest, nowMs = Date.now()): SwapQuoteObservationDTO {
  const manifest = manifestSchema.parse(configured), request = quoteRequestSchema.parse(requested);
  const result = swapQuoteObservationSchema.parse(input);
  if (result.status === 'unavailable') {
    if (!Number.isInteger(httpStatus) || httpStatus < 400 || httpStatus > 599) invalid('Quote response status mismatch');
    return result;
  }
  if (httpStatus !== 200 || !manifest.verified) invalid('Verified quote deployment required');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) invalid('Invalid observation clock');
  const deploymentId = keccak256(encodeAbiParameters([{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
    [BigInt(manifest.chainId), manifest.aqua as Address, manifest.router as Address, manifest.payments as Address]));
  if (result.chainId !== manifest.chainId || !same(result.router, manifest.router) || !same(result.deploymentId, deploymentId)
    || result.deploymentStartBlock !== manifest.startBlock) invalid('Quote deployment mismatch');
  for (const key of ['wallet', 'recipient', 'tokenIn', 'tokenOut'] as const) {
    if (!same(result.request[key], request[key])) invalid('Quote request mismatch');
  }
  if (result.request.amountInRaw !== request.amountInRaw || result.request.slippageBps !== request.slippageBps
    || result.request.maxCrossings !== request.maxCrossings) invalid('Quote request mismatch');
  if ([manifest.aqua, manifest.router, manifest.payments].some(a => same(a, request.wallet))
    || [manifest.aqua, manifest.router].some(a => same(a, request.recipient))
    || [request.tokenIn, request.tokenOut].some(a => !manifest.tokens.some(t => same(t.address, a)))) invalid('Invalid quote roles or pair');

  const pin = BigInt(result.asOf.height), current = BigInt(result.currentIndexedBlock.height), head = BigInt(result.freshness.head);
  if (pin < BigInt(manifest.startBlock) || pin > current || !isFreshIndexedHead(manifest.chainId,head,current) || result.historical !== (pin < current)
    || (pin === current && !same(result.asOf.hash, result.currentIndexedBlock.hash))) invalid('Invalid canonical quote pin');
  const indexedAt = Date.parse(result.freshness.indexedAt), observedAt = Date.parse(result.freshness.observedAt);
  const timestamp = BigInt(result.freshness.blockTimestamp), deadline = timestamp+20n;
  const expectedAge = Math.max(0, observedAt-indexedAt);
  // Date serialization truncates the service's fractional monotonic milliseconds;
  // its separately rounded-up age can differ by one millisecond, never seconds.
  if (deadline >= (1n << 40n) || observedAt > nowMs+1000 || indexedAt > observedAt+1000 || indexedAt > nowMs+1000
    || observedAt-indexedAt > 10000 || nowMs-indexedAt > 10000
    || result.freshness.ageMs < expectedAge || result.freshness.ageMs > expectedAge+1
    || Number(timestamp)*1000 > observedAt+1000 || Number(timestamp)*1000 > nowMs+1000
    || Number(deadline)*1000 <= observedAt || Number(deadline)*1000 <= nowMs) invalid('Stale or inconsistent quote time');

  const routes = result.data.best ? [result.data.best, ...result.data.alternatives] : [];
  const quoted = new Set(result.data.diagnostics.filter(d => d.code === 'QUOTED').map(d => d.orderHash.toLowerCase()));
  if (new Set(routes.map(r => r.orderHash.toLowerCase())).size !== routes.length
    || (result.data.coverage.scanTruncated && result.data.counts.scanned !== 200)) invalid('Invalid retained quote set');
  for (const route of routes) {
    const config = configFromDTO(route.config);
    if (config.chainId !== BigInt(manifest.chainId) || !same(config.router, manifest.router)
      || !same(hashConfig(config), route.configHash) || !same(hashOrder(buildOrder(config)), route.orderHash)
      || !quoted.has(route.orderHash.toLowerCase())) invalid('Quote configuration or order mismatch');
    if (config.tokens.some((a, i) => !manifest.tokens.some(t => same(t.address, a) && t.decimals === config.decimals[i]))
      || [request.wallet, request.recipient, manifest.aqua, manifest.router].some(a => same(a, config.maker))) invalid('Invalid quote strategy roles or tokens');
    const inputIndex = config.tokens.findIndex(t => same(t, request.tokenIn)), outputIndex = config.tokens.findIndex(t => same(t, request.tokenOut));
    if (inputIndex < 0 || outputIndex < 0 || inputIndex === outputIndex || !same(route.payer, request.wallet) || !same(route.caller, request.wallet)
      || !same(route.recipient, request.recipient) || !same(route.tokenIn, request.tokenIn) || !same(route.tokenOut, request.tokenOut)
      || route.amountInRaw !== request.amountInRaw || route.maxCrossings !== request.maxCrossings) invalid('Quote route differs from request');
    const gross = BigInt(route.amountInRaw), output = BigInt(route.amountOutRaw), fee = feeIn(gross, config.feePpm);
    const minimum = output*BigInt(10000-request.slippageBps)/10000n;
    if (route.feePpm !== config.feePpm || BigInt(route.feeRaw) !== fee || fee >= gross
      || BigInt(route.minimumOutRaw) !== (minimum || 1n) || BigInt(route.expiresAt) !== deadline
      || gross*10n**BigInt(18-config.decimals[inputIndex]!)*(1n << 64n) >= (1n << 160n)
      || output*10n**BigInt(18-config.decimals[outputIndex]!)*(1n << 64n) >= (1n << 160n)) invalid('Invalid quote arithmetic or limits');
  }
  for (let i = 1; i < routes.length; i++) {
    const a = routes[i-1]!, b = routes[i]!, x = BigInt(a.amountOutRaw), y = BigInt(b.amountOutRaw);
    if (x < y || (x === y && (a.feePpm > b.feePpm || (a.feePpm === b.feePpm && a.orderHash.toLowerCase() > b.orderHash.toLowerCase())))) invalid('Quote alternatives are not ranked');
  }
  // This establishes wire/deployment/arithmetic coherence only. It neither
  // authenticates the server's RPC source nor replaces fresh wallet reads,
  // simulation, explicit review, onchain thresholds or receipt verification.
  return result;
}
