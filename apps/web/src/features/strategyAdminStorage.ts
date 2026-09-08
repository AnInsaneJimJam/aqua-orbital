import {hashSchema,manifestSchema,uint40Schema} from '@orbital/shared';
import {validateStrategyAdminReceiptIntent,configToDTO,configFromDTO,orderToDTO,orderFromDTO,type StrategyAdminReceiptIntent,type PendingTransaction} from '@orbital/sdk';
export type PendingStrategyAdmin=StrategyAdminReceiptIntent&{schemaVersion:1;transaction:PendingTransaction};
export const strategyAdminStoragePrefix=(chain:number,account:string)=>`orbital:strategy-admin:1:${chain}:${account.toLowerCase()}:`;
export const strategyAdminStorageKey=(p:PendingStrategyAdmin)=>strategyAdminStoragePrefix(p.transaction.chainId,p.transaction.account)+p.transaction.hash.toLowerCase();
export function encodePendingStrategyAdmin(p:PendingStrategyAdmin){
 return JSON.stringify({...p,context:{...p.context,now:p.context.now.toString()},input:{config:configToDTO(p.input.config),order:orderToDTO(p.input.order)},plan:{...p.plan,value:'0'}});
}
export function decodePendingStrategyAdmin(raw:string,chain:number,account:string):PendingStrategyAdmin{
 if(raw.length>32000)throw Error('Invalid strategy recovery record');const parsed=JSON.parse(raw);
 if(parsed.schemaVersion!==1||parsed.plan?.value!=='0')throw Error('Invalid strategy recovery record');uint40Schema.parse(parsed.context?.now);
 const p:PendingStrategyAdmin={...parsed,context:{...parsed.context,manifest:manifestSchema.parse(parsed.context.manifest),now:BigInt(parsed.context.now)},
  input:{config:configFromDTO(parsed.input?.config),order:orderFromDTO(parsed.input?.order)},plan:{...parsed.plan,value:0n}},t=p.transaction;
 if(t.schemaVersion!==1||t.chainId!==chain||t.account.toLowerCase()!==account.toLowerCase()||p.plan.chainId!==chain||p.plan.account.toLowerCase()!==account.toLowerCase()
  ||typeof t.label!=='string'||t.label.length>200||typeof p.plan.label!=='string'||p.plan.label.length>200)throw Error('Strategy recovery scope mismatch');
 hashSchema.parse(t.hash);validateStrategyAdminReceiptIntent(p);return p;
}
export function readPendingStrategyAdmin(chain:number,account:string){
 const prefix=strategyAdminStoragePrefix(chain,account),keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort();
 if(keys.length>64)throw Error('Too many saved strategy actions');
 return keys.map(key=>{const p=decodePendingStrategyAdmin(localStorage.getItem(key)!,chain,account);if(strategyAdminStorageKey(p)!==key)throw Error('Saved strategy hash mismatch');return p;});
}
