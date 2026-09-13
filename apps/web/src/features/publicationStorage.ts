import {prepareStrategyProfile,configFromDTO,hashConfig,type StrategyProfileInput} from '@orbital/sdk';
import type {DeploymentManifest} from '@orbital/shared';
import type {Address} from 'viem';

export const publicationStorageKey=(manifest:DeploymentManifest,maker:string)=>`orbital:publication:1:${manifest.chainId}:${manifest.router.toLowerCase()}:${maker.toLowerCase()}`;
export function readPublicationDraft(manifest:DeploymentManifest,maker:Address){
 const key=publicationStorageKey(manifest,maker),raw=localStorage.getItem(key);if(!raw)return;
 if(raw.length>16000)throw Error('Saved publication is too large');
 const parsed=JSON.parse(raw),saved=configFromDTO(parsed.config),profile=parsed.profile as StrategyProfileInput;
 const prepared=prepareStrategyProfile(manifest,maker,saved.makerNonce,profile);
 if(parsed.schemaVersion!==1||hashConfig(saved)!==prepared.configHash)throw Error('Saved publication does not match its reviewed configuration');
 return {key,prepared,profile};
}
