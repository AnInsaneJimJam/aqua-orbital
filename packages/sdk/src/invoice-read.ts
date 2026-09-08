import {hashSchema, invoiceDetailSchema, manifestSchema, type DeploymentManifest, type InvoiceDetailDTO, type Token} from '@orbital/shared';
import {encodeAbiParameters, keccak256, type Address} from 'viem';

/** Public read validation; never authorizes payment or constructs a transaction. */
export function decodeInvoiceDetail(input: unknown, httpStatus: number, configured: DeploymentManifest, requestedId: string): InvoiceDetailDTO {
  const manifest = manifestSchema.parse(configured), id = hashSchema.parse(requestedId).toLowerCase();
  if (!manifest.verified) throw Error('Verified deployment required');
  const result = invoiceDetailSchema.parse(input), invoice = result.data.invoice;
  if (httpStatus !== (invoice ? 200 : 404)) throw Error('Invoice response status mismatch');
  // This ABI identity matches the API/indexer's deployment scope. Credentials
  // and presentation metadata do not belong to the deployed contract identity.
  const deploymentId = keccak256(encodeAbiParameters([{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
    [BigInt(manifest.chainId), manifest.aqua as Address, manifest.router as Address, manifest.payments as Address]));
  if (result.chainId !== manifest.chainId || result.deploymentId.toLowerCase() !== deploymentId || result.coverage.fromBlock !== manifest.startBlock) throw Error('Invoice deployment mismatch');
  if (invoice) {
    if (invoice.invoiceId.toLowerCase() !== id || invoice.adapter.toLowerCase() !== manifest.payments.toLowerCase()
      || invoice.settlementToken.address.toLowerCase() !== manifest.usdc.toLowerCase()) throw Error('Invoice identity mismatch');
    const tokenMatches = (token: Token) => manifest.tokens.some(t => t.address.toLowerCase() === token.address.toLowerCase()
      && t.decimals === token.decimals && t.symbol === token.symbol && t.mock === token.mock);
    if (!tokenMatches(invoice.settlementToken) || (invoice.payment && !tokenMatches(invoice.payment.inputToken))) throw Error('Invoice token metadata mismatch');
  }
  return result;
}
