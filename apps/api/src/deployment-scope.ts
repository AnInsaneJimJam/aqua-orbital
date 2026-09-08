import {manifestSchema, type DeploymentManifest} from '@orbital/shared';
import {encodeAbiParameters, keccak256, type Address} from 'viem';

/** Database identity matches the indexer's immutable deployment scope. It is
 * deliberately independent of transport credentials and display metadata.
 * Real database tests bind this helper to the indexer's deploymentScope. */
export function readinessDeploymentScope(input: DeploymentManifest) {
  const manifest = manifestSchema.parse(input);
  if (!manifest.verified) throw Error('DEPLOYMENT_NOT_VERIFIED');
  const {chainId} = manifest;
  const roles = {aqua: manifest.aqua.toLowerCase(), router: manifest.router.toLowerCase(), payments: manifest.payments.toLowerCase(), usdc: manifest.usdc.toLowerCase()};
  const id = keccak256(encodeAbiParameters([{type: 'uint256'}, {type: 'address'}, {type: 'address'}, {type: 'address'}],
    [BigInt(chainId), roles.aqua as Address, roles.router as Address, roles.payments as Address]));
  const identity = {chainId, ...roles, startBlock: manifest.startBlock, tokens: manifest.tokens.map(token => ({
    address: token.address.toLowerCase(), decimals: token.decimals, mock: token.mock,
  })).sort((a, b) => a.address.localeCompare(b.address))};
  return {chainId, id, ...roles, startBlock: manifest.startBlock, identity};
}
